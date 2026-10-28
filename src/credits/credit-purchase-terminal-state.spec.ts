import { describe, expect, it, jest } from '@jest/globals';
import { FindOperator } from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { CreditPurchasesService } from './credit-purchases.service';
import { CreditPurchase } from './entities/credit-purchase.entity';
import { CreditWallet } from './entities/credit-wallet.entity';
import { CreditLedgerEntry } from './entities/credit-ledger-entry.entity';
import { CreditPurchaseStatus as Status } from './types';

const dto = { packageName: 'test.package', purchaseToken: 'test-token' };
const consumed = 'CONSUMPTION_STATE_CONSUMED';
const notConsumed = 'CONSUMPTION_STATE_YET_TO_BE_CONSUMED';
const clone = <T>(value: T): T => structuredClone(value);

// Stateful repository model: enforce UPDATE predicates against the current row,
// while reads return snapshots as they do across awaited external calls.
function fixture(
  status = Status.PURCHASED,
  consumptionState: string | null = notConsumed,
) {
  let row: any = {
    id: 51,
    userId: 167,
    provider: 'GOOGLE_PLAY',
    productId: 'nemory_credits_5000',
    purchaseToken: dto.purchaseToken,
    status,
    consumedAt: null,
    refundedAt: null,
    creditsGranted: status === Status.CANCELED ? 0 : 5000,
    creditsRevoked: status === Status.REFUNDED ? 5000 : 0,
    metadata: { packageName: dto.packageName },
  };
  let wallet: any = {
    id: 41,
    userId: 167,
    balance: status === Status.PURCHASED ? 5000 : 0,
    totalPurchased: row.creditsGranted,
    totalSpent: 0,
    totalRevoked: row.creditsRevoked,
  };
  const ledger: any[] = [];
  const user = { id: 167, uuid: 'test-user' };
  const summary = () => ({
    remaining: Math.max(0, wallet.balance),
    debt: Math.max(0, -wallet.balance),
  });
  const manager = {
    findOne: jest.fn(async (entity: unknown) =>
      entity === User
        ? clone(user)
        : entity === CreditPurchase
          ? clone(row)
          : entity === CreditWallet
            ? clone(wallet)
            : null,
    ),
    create: jest.fn((_entity: unknown, data: any) => clone(data)),
    save: jest.fn(async (entity: unknown, data: any) => {
      if (entity === CreditPurchase) row = clone(data);
      if (entity === CreditWallet) wallet = clone(data);
      if (entity === CreditLedgerEntry) ledger.push(clone(data));
      return clone(data);
    }),
  };
  const matches = (criteria: any) =>
    typeof criteria === 'number'
      ? criteria === row.id
      : Object.entries(criteria).every(([key, value]) =>
          value instanceof FindOperator && value.type === 'isNull'
            ? row[key] == null
            : row[key] === value,
        );
  const repository = {
    find: jest.fn(async () => [clone(row)]),
    findOne: jest.fn(async () => clone(row)),
    update: jest.fn(async (criteria: any, patch: any) => {
      if (!matches(criteria)) return { affected: 0 };
      row = { ...row, ...clone(patch) };
      return { affected: 1 };
    }),
  };
  const google = {
    verify: jest.fn(async () => ({
      productId: row.productId,
      purchaseToken: dto.purchaseToken,
      purchaseState: 'PURCHASED',
      quantity: 1,
      obfuscatedAccountId: user.uuid,
      consumptionState,
    })),
    consume: jest.fn(async () => {}),
  };
  const service = new CreditPurchasesService(
    { transaction: async (work: any) => work(manager) } as any,
    repository as any,
    { findOne: async () => clone(user) } as any,
    google as any,
    { getSummary: async () => summary(), toSummary: summary } as any,
  );
  return {
    service,
    google,
    repository,
    manager,
    ledger,
    row: () => clone(row),
    wallet: () => clone(wallet),
    change: (patch: any) => {
      row = { ...row, ...patch };
    },
    purchase: () => service.purchaseGooglePlay(167, dto),
    rtdn: () =>
      service.handleGooglePlayRtdn(
        dto.packageName,
        dto.purchaseToken,
        row.productId,
        1,
      ),
    refund: () =>
      service.handleVoidedGooglePlayPurchase(dto.purchaseToken, 'test-order'),
  };
}

describe('Credit purchase terminal-state protection', () => {
  for (const status of [Status.REFUNDED, Status.CANCELED]) {
    for (const source of ['purchase', 'rtdn'] as const) {
      it.each([consumed, notConsumed, null])(
        `${source} preserves ${status} with Google state %s`,
        async (state) => {
          const f = fixture(status, state);
          const before = f.row();
          await f[source]();
          expect(f.row()).toEqual(before);
          expect(f.google.consume).not.toHaveBeenCalled();
          expect(f.manager.save).not.toHaveBeenCalled();
          expect(f.repository.update).not.toHaveBeenCalled();
        },
      );
    }

    it.each(['success', 'failure'] as const)(
      `preserves concurrent ${status} after consume %s`,
      async (outcome) => {
        const f = fixture();
        f.google.consume.mockImplementationOnce(async () => {
          if (status === Status.REFUNDED) await f.refund();
          else
            f.change({ status, metadata: { canceledBy: 'concurrent-writer' } });
          if (outcome === 'failure') throw new Error('Google unavailable');
        });
        const result = await f.purchase();
        expect(result.consumptionPending).toBe(false);
        expect(f.row()).toMatchObject({ status, consumedAt: null });
        expect(f.row().metadata.consumeRetryRequired).toBeUndefined();
        if (status === Status.REFUNDED) {
          expect(f.row()).toMatchObject({
            creditsGranted: 5000,
            creditsRevoked: 5000,
            metadata: { voidedOrderId: 'test-order' },
          });
          expect(f.wallet().balance).toBe(0);
          await f.refund();
          expect(f.ledger).toHaveLength(1);
          expect(f.wallet().balance).toBe(0);
        } else
          expect(f.row().metadata).toEqual({ canceledBy: 'concurrent-writer' });
      },
    );

    it(`background reconciliation cannot overwrite concurrent ${status}`, async () => {
      const f = fixture();
      f.google.verify.mockImplementationOnce(async () => {
        if (status === Status.REFUNDED) await f.refund();
        else f.change({ status });
        return {
          productId: f.row().productId,
          purchaseToken: dto.purchaseToken,
          purchaseState: 'PURCHASED',
          quantity: 1,
          obfuscatedAccountId: 'test-user',
          consumptionState: consumed,
        };
      });
      await f.service.retryPendingConsumptions();
      expect(f.row()).toMatchObject({ status, consumedAt: null });
      expect(f.google.consume).not.toHaveBeenCalled();
    });
  }

  it('keeps refund metadata when background verification fails after refund', async () => {
    const f = fixture();
    f.google.verify.mockImplementationOnce(async () => {
      await f.refund();
      throw new Error('network');
    });
    await f.service.retryPendingConsumptions();
    expect(f.row()).toMatchObject({
      status: Status.REFUNDED,
      metadata: { voidedOrderId: 'test-order' },
    });
    expect(f.row().metadata.consumeRetryRequired).toBeUndefined();
    expect(f.wallet().balance).toBe(0);
  });

  it('keeps a retryable failure and then consumes exactly once without regranting', async () => {
    const f = fixture();
    f.google.consume.mockRejectedValueOnce(new Error('network'));
    expect((await f.purchase()).consumptionPending).toBe(true);
    expect(f.row()).toMatchObject({
      status: Status.PURCHASED,
      consumedAt: null,
      metadata: { consumeRetryRequired: true },
    });
    expect((await f.purchase()).consumptionPending).toBe(false);
    const committed = f.row();
    expect(committed).toMatchObject({
      status: Status.CONSUMED,
      metadata: { consumeRetryRequired: false },
    });
    expect(Number.isFinite(committed.consumedAt?.getTime())).toBe(true);
    await f.purchase();
    expect(f.row()).toEqual(committed);
    expect(f.google.consume).toHaveBeenCalledTimes(2);
    expect(f.manager.save).not.toHaveBeenCalled();
    expect(f.wallet().balance).toBe(5000);
  });

  it('refund after successful consumption still revokes only once', async () => {
    const f = fixture();
    await f.purchase();
    await f.refund();
    await f.purchase();
    await f.refund();
    expect(f.row()).toMatchObject({
      status: Status.REFUNDED,
      creditsRevoked: 5000,
    });
    expect(Number.isFinite(f.row().consumedAt?.getTime())).toBe(true);
    expect(f.wallet().balance).toBe(0);
    expect(f.ledger).toHaveLength(1);
  });

  it('cancellation only updates a still-ungranted pending purchase', async () => {
    const f = fixture();
    f.change({ creditsGranted: 0 });
    await f.service.handleGooglePlayRtdn(
      dto.packageName,
      dto.purchaseToken,
      f.row().productId,
      2,
    );
    expect(f.row().status).toBe(Status.CANCELED);
    expect(f.google.verify).not.toHaveBeenCalled();
  });

  it('late consume failure cannot requeue a purchase consumed by another request', async () => {
    const f = fixture();
    f.google.consume.mockImplementationOnce(async () => {
      await f.purchase();
      throw new Error('late network failure');
    });
    expect((await f.purchase()).consumptionPending).toBe(false);
    expect(f.row()).toMatchObject({
      status: Status.CONSUMED,
      metadata: { consumeRetryRequired: false },
    });
    expect(f.row().metadata.consumeError).toBeUndefined();
    expect(f.manager.save).not.toHaveBeenCalled();
    expect(f.wallet().balance).toBe(5000);
  });

  it('stale cancellation cannot cancel credits granted after its read', async () => {
    const f = fixture();
    f.change({ creditsGranted: 0 });
    f.repository.findOne.mockImplementationOnce(async () => {
      const stale = f.row();
      f.change({ creditsGranted: 5000 });
      return stale;
    });
    await f.service.handleGooglePlayRtdn(
      dto.packageName,
      dto.purchaseToken,
      f.row().productId,
      2,
    );
    expect(f.row()).toMatchObject({
      status: Status.PURCHASED,
      creditsGranted: 5000,
    });
  });

  it('stale cancellation cannot replace a refund committed after its read', async () => {
    const f = fixture();
    f.change({ creditsGranted: 0 });
    f.repository.findOne.mockImplementationOnce(async () => {
      const stale = f.row();
      f.change({ status: Status.REFUNDED });
      return stale;
    });
    await f.service.handleGooglePlayRtdn(
      dto.packageName,
      dto.purchaseToken,
      f.row().productId,
      2,
    );
    expect(f.row().status).toBe(Status.REFUNDED);
  });
});
