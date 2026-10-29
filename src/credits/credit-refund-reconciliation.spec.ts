import { describe, expect, it, jest } from '@jest/globals';
import { CreditPurchasesService } from './credit-purchases.service';
import { CreditPurchase } from './entities/credit-purchase.entity';
import { CreditWallet } from './entities/credit-wallet.entity';
import { CreditLedgerEntry } from './entities/credit-ledger-entry.entity';
import { CreditPurchaseStatus as Status } from './types';

function fixture(count = 1) {
  const rows = Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    userId: i + 1,
    provider: 'GOOGLE_PLAY',
    productId: 'nemory_credits_20000',
    orderId: `order-${i + 1}`,
    purchaseToken: `token-${i + 1}`,
    status: Status.CONSUMED,
    creditsGranted: 20000,
    creditsRevoked: 0,
    consumedAt: new Date(),
    metadata: { packageName: 'test.package', financial: 'preserve' } as Record<
      string,
      string
    >,
  }));
  const wallets = rows.map((p) => ({
    id: p.userId,
    userId: p.userId,
    balance: 19999,
    totalPurchased: 20000,
    totalSpent: 1,
    totalRevoked: 0,
  }));
  const ledger: any[] = [];
  const clone = <T>(value: T): T => structuredClone(value);
  const manager = {
    findOne: jest.fn(async (entity: unknown, options: any) =>
      clone(
        entity === CreditPurchase
          ? rows.find((p) => p.purchaseToken === options.where.purchaseToken)
          : wallets.find((w) => w.userId === options.where.userId),
      ),
    ),
    create: (_entity: unknown, value: any) => value,
    save: jest.fn(async (entity: unknown, value: any) => {
      if (entity === CreditPurchase)
        Object.assign(rows.find((p) => p.id === value.id)!, clone(value));
      if (entity === CreditWallet)
        Object.assign(wallets.find((w) => w.id === value.id)!, clone(value));
      if (entity === CreditLedgerEntry) ledger.push(clone(value));
      return clone(value);
    }),
  };
  // Serialize modeled transactions as the production purchase/wallet row locks do.
  let tail: Promise<unknown> = Promise.resolve();
  const transaction = (work: any) => {
    const next = tail.then(() => work(manager));
    tail = next.catch(() => {});
    return next;
  };
  const repository = {
    findOne: jest.fn(async (o: any) =>
      clone(rows.find((p) => p.purchaseToken === o.where.purchaseToken)),
    ),
  };
  const google = {
    verify: jest.fn(
      async (_pkg: string, token: string, _options?: unknown) => ({
        productId: 'nemory_credits_20000',
        orderId: token.replace('token', 'order'),
        purchaseState: 'CANCELLED',
        consumptionState: 'CONSUMPTION_STATE_CONSUMED',
      }),
    ),
  };
  const service = new CreditPurchasesService(
    { transaction } as any,
    repository as any,
    {} as any,
    google as any,
    {
      toSummary: (w: any) => ({
        remaining: Math.max(0, w.balance),
        debt: Math.max(0, -w.balance),
      }),
    } as any,
  );
  return { service, google, rows, wallets, ledger, manager };
}

function cancel(f: ReturnType<typeof fixture>, token = 'token-1') {
  return f.service.handleGooglePlayRtdn(
    'test.package',
    token,
    'nemory_credits_20000',
    2,
  );
}

describe('Consumed credit purchase cancellation RTDN', () => {
  it('handles cancellation of consumed credits; repeated and voided notifications revoke once', async () => {
    const f = fixture();
    await cancel(f);
    await cancel(f);
    await f.service.handleVoidedGooglePlayPurchase('token-1', 'order-1');
    expect(f.rows[0]).toMatchObject({
      status: Status.REFUNDED,
      creditsRevoked: 20000,
      metadata: {
        financial: 'preserve',
        packageName: 'test.package',
        voidedOrderId: 'order-1',
      },
    });
    expect(f.wallets[0]).toMatchObject({ balance: -1, totalRevoked: 20000 });
    expect(f.ledger).toHaveLength(1);
    expect(f.ledger[0]).toMatchObject({ amount: -20000, balanceAfter: -1 });
    expect(f.google.verify).toHaveBeenCalledTimes(1);
  });

  it.each(['PURCHASED', 'PENDING', 'PURCHASE_STATE_UNSPECIFIED'])(
    'does not debit Google state %s',
    async (state) => {
      const f = fixture();
      f.google.verify.mockImplementation(async () => ({
        productId: f.rows[0].productId,
        orderId: 'order-1',
        purchaseState: state,
        consumptionState: 'CONSUMPTION_STATE_CONSUMED',
      }));
      await cancel(f);
      expect(f.wallets[0].balance).toBe(19999);
      expect(f.rows[0].status).toBe(Status.CONSUMED);
      expect(f.ledger).toHaveLength(0);
    },
  );

  it.each(['productId', 'orderId'] as const)(
    'rejects a mismatching %s before debiting',
    async (field) => {
      const f = fixture();
      f.google.verify.mockResolvedValueOnce({
        productId: f.rows[0].productId,
        orderId: 'order-1',
        purchaseState: 'CANCELLED',
        consumptionState: 'CONSUMPTION_STATE_CONSUMED',
        [field]: 'different',
      });
      await expect(cancel(f)).rejects.toThrow(
        'Refund verification purchase mismatch',
      );
      expect(f.ledger).toHaveLength(0);
      expect(f.wallets[0].balance).toBe(19999);
    },
  );

  it('propagates a network failure so Pub/Sub can redeliver, then revokes once', async () => {
    const f = fixture();
    f.google.verify.mockRejectedValueOnce(new Error('network'));
    await expect(cancel(f)).rejects.toThrow('network');
    expect(f.rows[0].status).toBe(Status.CONSUMED);
    expect(f.ledger).toHaveLength(0);
    await cancel(f);
    expect(f.rows[0].status).toBe(Status.REFUNDED);
    expect(f.ledger).toHaveLength(1);
  });

  it('cancellation RTDN verifies and revokes an already consumed purchase', async () => {
    const f = fixture();
    await f.service.handleGooglePlayRtdn(
      'test.package',
      'token-1',
      f.rows[0].productId,
      2,
    );
    await cancel(f);
    expect(f.rows[0].status).toBe(Status.REFUNDED);
    expect(f.ledger).toHaveLength(1);
  });

  it('a concurrent voided callback during verification does not cause a second debit', async () => {
    const f = fixture();
    const verify = f.google.verify.getMockImplementation()!;
    f.google.verify.mockImplementationOnce(async (...args) => {
      await f.service.handleVoidedGooglePlayPurchase('token-1', 'order-1');
      return verify(...args);
    });
    await cancel(f);
    expect(f.wallets[0].balance).toBe(-1);
    expect(f.ledger).toHaveLength(1);
  });

  it('propagates a missing-wallet failure instead of acknowledging an unapplied refund', async () => {
    const f = fixture();
    f.wallets.length = 0;
    await expect(cancel(f)).rejects.toThrow('Refund could not be applied');
    expect(f.rows[0].status).toBe(Status.CONSUMED);
    expect(f.ledger).toHaveLength(0);
  });
});
