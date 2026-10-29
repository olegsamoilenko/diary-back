import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { CreditPurchasesService } from './credit-purchases.service';
import { CreditPurchaseStatus } from './types';

afterEach(() => {
  jest.restoreAllMocks();
});

function fixture(pending = true) {
  const row: any = {
    id: 1,
    userId: 2,
    provider: 'GOOGLE_PLAY',
    productId: 'nemory_credits_5000',
    orderId: 'order-1',
    purchaseToken: 'token-1',
    status: CreditPurchaseStatus.CONSUMED,
    amount: null,
    currency: null,
    financialDetailsPending: pending,
    metadata: { packageName: 'test.package' },
    creditsGranted: 5000,
  };
  const repository = {
    find: jest.fn(async () =>
      row.financialDetailsPending ? [{ ...row }] : [],
    ),
    findOne: jest.fn(async () => ({ ...row })),
    update: jest.fn(async (criteria: any, patch: any) => {
      if (!Object.entries(criteria).every(([key, value]) => row[key] === value))
        return { affected: 0 };
      Object.assign(row, patch);
      return { affected: 1 };
    }),
  };
  const google = {
    verify: jest.fn(async () => ({
      ...row,
      purchaseState: 'PURCHASED',
      obfuscatedAccountId: 'owner',
    })),
    consume: jest.fn(async () => {}),
    getFinancialDetails: jest.fn(
      async (): Promise<any> => ({
        amount: '104.99',
        currency: 'UAH',
        developerRevenue: '74.37',
        taxAmount: '17.50',
      }),
    ),
  };
  const service = new CreditPurchasesService(
    {} as any,
    repository as any,
    { findOne: async () => ({ id: 2 }) } as any,
    google as any,
    {} as any,
  );
  const grant = jest
    .spyOn(service as any, 'grantVerifiedPurchase')
    .mockImplementation(async () => ({
      purchase: { ...row },
      alreadyGranted: false,
      purchasedCredits: { remaining: 5000 },
    }));
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  const buy = () =>
    service.purchaseGooglePlay(2, {
      packageName: 'test.package',
      purchaseToken: 'token-1',
    });
  return { row, repository, google, service, grant, buy };
}

describe('credit purchase financial synchronization', () => {
  it('keeps committed credits available on Google failure and retries after consumption', async () => {
    const f = fixture();
    f.google.getFinancialDetails.mockRejectedValueOnce(
      new Error('Google unavailable'),
    );
    expect((await f.buy()).purchasedCredits.remaining).toBe(5000);
    expect(f.row).toMatchObject({
      amount: null,
      financialDetailsPending: true,
      creditsGranted: 5000,
    });
    await f.service.retryPendingFinancialDetails();
    expect(f.row).toMatchObject({
      amount: '104.99',
      currency: 'UAH',
      financialDetailsPending: false,
    });
    expect(f.grant).toHaveBeenCalledTimes(1);
    expect(f.google.consume).not.toHaveBeenCalled();
    expect(f.repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { provider: 'GOOGLE_PLAY', financialDetailsPending: true },
        take: 50,
      }),
    );
  });

  it('synchronizes purchases received through RTDN as well as the client', async () => {
    const f = fixture();
    await f.service.handleGooglePlayRtdn(
      'test.package',
      'token-1',
      f.row.productId,
      1,
    );
    expect(f.row.amount).toBe('104.99');
  });

  it('leaves old and manually populated purchases untouched on replay and scheduled retry', async () => {
    const f = fixture(false);
    f.row.amount = '50.00';
    f.row.currency = 'UAH';
    await f.buy();
    await f.service.retryPendingFinancialDetails();
    expect(f.row.amount).toBe('50.00');
    expect(f.google.getFinancialDetails).not.toHaveBeenCalled();
  });

  it('keeps retrying when gross is known but developer revenue is still absent', async () => {
    const f = fixture();
    f.google.getFinancialDetails.mockResolvedValueOnce({
      amount: '2.49',
      currency: 'USD',
    });
    await f.buy();
    expect(f.row).toMatchObject({
      amount: '2.49',
      financialDetailsPending: true,
    });
    await f.service.retryPendingFinancialDetails();
    expect(f.google.getFinancialDetails).toHaveBeenCalledTimes(2);
    expect(f.row.developerRevenue).toBe('74.37');
  });

  it('does not overwrite manual data if pending is disabled during the request', async () => {
    const f = fixture();
    f.google.getFinancialDetails.mockImplementationOnce(async () => {
      Object.assign(f.row, {
        amount: '55',
        currency: 'UAH',
        financialDetailsPending: false,
      });
      return { amount: '2.49', currency: 'USD' };
    });
    await f.buy();
    expect(f.row).toMatchObject({
      amount: '55',
      currency: 'UAH',
      financialDetailsPending: false,
    });
  });

  it('does not reactivate a purchase refunded during the Google request', async () => {
    const f = fixture();
    f.google.getFinancialDetails.mockImplementationOnce(async () => {
      f.row.status = CreditPurchaseStatus.REFUNDED;
      return { amount: '2.49', currency: 'USD' };
    });
    await f.buy();
    expect(f.row.status).toBe(CreditPurchaseStatus.REFUNDED);
  });

  it('does not fail the purchase response if writing financial details fails', async () => {
    const f = fixture();
    f.repository.update.mockRejectedValueOnce(
      new Error('Database unavailable'),
    );
    expect((await f.buy()).purchasedCredits.remaining).toBe(5000);
    expect(f.row.financialDetailsPending).toBe(true);
  });
});
