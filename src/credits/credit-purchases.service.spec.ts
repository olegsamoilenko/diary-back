import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { CreditPurchasesService } from './credit-purchases.service';
import { CreditLedgerEntry } from './entities/credit-ledger-entry.entity';
import { CreditPurchase } from './entities/credit-purchase.entity';
import { CreditWallet } from './entities/credit-wallet.entity';
import { User } from 'src/users/entities/user.entity';
import { UserPlanState } from 'src/subscriptions/entities/user-plan-state.entity';
import { CreditPurchaseProvider, CreditPurchaseStatus } from './types';

describe('CreditPurchasesService', () => {
  const dataSource = { transaction: jest.fn() };
  const purchasesRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };
  const usersRepository = { findOne: jest.fn() };
  const googlePlay = { verify: jest.fn(), consume: jest.fn() };
  const creditWalletService = {
    getSummary: jest.fn(),
    toSummary: jest.fn((wallet: any) => ({
      total: wallet.totalPurchased - wallet.totalRevoked,
      used: wallet.totalSpent,
      remaining: Math.max(0, wallet.balance),
      debt: Math.max(0, -wallet.balance),
    })),
  };
  let service: CreditPurchasesService;

  const verified = {
    productId: 'nemory_credits_5000',
    purchaseOptionId: 'buy-5000',
    purchaseToken: 'purchase-token',
    orderId: 'GPA.1',
    purchaseState: 'PURCHASED',
    consumptionState: 'CONSUMPTION_STATE_YET_TO_BE_CONSUMED',
    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
    quantity: 1,
    refundableQuantity: 1,
    obfuscatedAccountId: 'user-uuid',
    regionCode: 'UA',
    purchasedAt: new Date('2026-08-25T08:00:00.000Z'),
    testPurchase: false,
    rawStoreData: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CreditPurchasesService(
      dataSource as any,
      purchasesRepository as any,
      usersRepository as any,
      googlePlay as any,
      creditWalletService as any,
    );
  });

  it('grants a verified SKU exactly once and consumes it after commit', async () => {
    (googlePlay.verify as any).mockResolvedValueOnce(verified);
    (googlePlay.consume as any).mockResolvedValueOnce(undefined);
    const manager = {
      findOne: jest.fn(async (entity: any) => {
        if (entity === User) {
          return { id: 167, uuid: 'user-uuid', subscriptionRuntime: 'V2' };
        }
        if (entity === CreditPurchase || entity === CreditWallet) {
          return null;
        }
        if (entity === UserPlanState) {
          return { id: 9, userId: 167 };
        }
        return null;
      }),
      create: jest.fn((entity: any, payload: any) => ({
        ...(entity === CreditWallet ? { id: 41 } : {}),
        ...(entity === CreditPurchase ? { id: 51 } : {}),
        ...payload,
      })),
      merge: jest.fn((_entity: any, target: any, payload: any) => ({
        ...target,
        ...payload,
      })),
      save: jest.fn(async (_entity: any, payload: any) => payload),
    };
    (dataSource.transaction as any).mockImplementationOnce((work: any) =>
      work(manager),
    );

    const result = await service.purchaseGooglePlay(167, {
      packageName: 'com.soniac12.nemory',
      purchaseToken: 'purchase-token',
      productId: 'nemory_credits_5000',
      obfuscatedAccountId: 'user-uuid',
    });

    expect(result).toEqual(
      expect.objectContaining({
        alreadyGranted: false,
        consumptionPending: false,
        purchasedCredits: {
          total: 5_000,
          used: 0,
          remaining: 5_000,
          debt: 0,
        },
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      CreditPurchase,
      expect.objectContaining({
        provider: CreditPurchaseProvider.GOOGLE_PLAY,
        productId: 'nemory_credits_5000',
        creditsGranted: 5_000,
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      CreditLedgerEntry,
      expect.objectContaining({ amount: 5_000, balanceAfter: 5_000 }),
    );
    expect(googlePlay.consume).toHaveBeenCalledWith(
      'com.soniac12.nemory',
      'nemory_credits_5000',
      'purchase-token',
    );
  });

  it('marks a credits-only user as having chosen the no-subscription mode', async () => {
    const user = {
      id: 167,
      uuid: 'user-uuid',
      subscriptionRuntime: 'LEGACY_COMPAT',
      usesWithoutSubscription: false,
    };
    const manager = {
      findOne: jest.fn(async (entity: any) =>
        entity === UserPlanState ? null : null,
      ),
      create: jest.fn((_entity: any, payload: any) => ({ id: 9, ...payload })),
      merge: jest.fn((_entity: any, target: any, payload: any) => ({
        ...target,
        ...payload,
      })),
      save: jest.fn(async (_entity: any, payload: any) => payload),
    };

    await (service as any).ensureV2State(manager, user);

    expect(manager.save).toHaveBeenCalledWith(
      UserPlanState,
      expect.objectContaining({
        source: 'NONE',
        useWithoutSubscription: true,
        metadata: expect.objectContaining({
          accessReason: 'USE_WITHOUT_SUBSCRIPTION',
        }),
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      User,
      expect.objectContaining({
        subscriptionRuntime: 'V2',
        usesWithoutSubscription: true,
      }),
    );
  });

  it('does not grant the same purchase token twice', async () => {
    const existing = {
      id: 51,
      userId: 167,
      provider: CreditPurchaseProvider.GOOGLE_PLAY,
      productId: 'nemory_credits_5000',
      purchaseToken: 'purchase-token',
      status: CreditPurchaseStatus.CONSUMED,
      consumedAt: new Date(),
      metadata: {},
    };
    (googlePlay.verify as any).mockResolvedValueOnce({
      ...verified,
      consumptionState: 'CONSUMPTION_STATE_CONSUMED',
    });
    (creditWalletService.getSummary as any).mockResolvedValueOnce({
      total: 5_000,
      used: 0,
      remaining: 5_000,
      debt: 0,
    });
    const manager = {
      findOne: jest.fn(async (entity: any) =>
        entity === User
          ? { id: 167, uuid: 'user-uuid' }
          : entity === CreditPurchase
            ? existing
            : null,
      ),
      create: jest.fn(),
      save: jest.fn(),
    };
    (dataSource.transaction as any).mockImplementationOnce((work: any) =>
      work(manager),
    );

    const result = await service.purchaseGooglePlay(167, {
      packageName: 'com.soniac12.nemory',
      purchaseToken: 'purchase-token',
    });

    expect(result.alreadyGranted).toBe(true);
    expect(manager.save).not.toHaveBeenCalled();
    expect(googlePlay.consume).not.toHaveBeenCalled();
  });

  it('reconciles pending local consumption from Google in the background', async () => {
    const purchase = {
      id: 51,
      userId: 167,
      provider: CreditPurchaseProvider.GOOGLE_PLAY,
      productId: 'nemory_credits_5000',
      purchaseToken: 'purchase-token',
      status: CreditPurchaseStatus.PURCHASED,
      consumedAt: null,
      metadata: { packageName: 'com.soniac12.nemory' },
      createdAt: new Date(),
    };
    (purchasesRepository.find as any).mockResolvedValueOnce([purchase]);
    (googlePlay.verify as any).mockResolvedValueOnce({
      ...verified,
      consumptionState: 'CONSUMPTION_STATE_CONSUMED',
    });

    await service.retryPendingConsumptions();

    expect(googlePlay.consume).not.toHaveBeenCalled();
    expect(purchasesRepository.update).toHaveBeenCalledWith(51, {
      status: CreditPurchaseStatus.CONSUMED,
      consumedAt: expect.any(Date),
    });
  });
});
