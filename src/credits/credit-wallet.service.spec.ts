import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { CreditLedgerEntry } from './entities/credit-ledger-entry.entity';
import { CreditWallet } from './entities/credit-wallet.entity';
import { CreditWalletService } from './credit-wallet.service';

describe('CreditWalletService', () => {
  const walletsRepository = { findOne: jest.fn() };
  const service = new CreditWalletService(walletsRepository as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('debits only the available balance and writes an audit entry', async () => {
    const wallet = {
      id: 41,
      userId: 167,
      balance: 200,
      totalPurchased: 5_000,
      totalSpent: 4_800,
      totalRevoked: 0,
    };
    const manager = {
      findOne: jest.fn(async () => wallet),
      create: jest.fn((_entity: any, payload: any) => payload),
      save: jest.fn(async (_entity: any, payload: any) => payload),
    };

    const result = await service.debitWithManager(manager as any, 167, 350, {
      operation: 'dialog',
    });

    expect(result).toEqual({
      chargedCredits: 200,
      summary: {
        total: 5_000,
        used: 5_000,
        remaining: 0,
        debt: 0,
        revoked: 0,
      },
    });
    expect(manager.save).toHaveBeenCalledWith(
      CreditWallet,
      expect.objectContaining({ balance: 0, totalSpent: 5_000 }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      CreditLedgerEntry,
      expect.objectContaining({ amount: -200, balanceAfter: 0 }),
    );
  });

  it('records overage as debt only when an authorized cycle allows it', async () => {
    const wallet = {
      id: 41,
      userId: 167,
      balance: 200,
      totalPurchased: 5_000,
      totalSpent: 4_800,
      totalRevoked: 0,
    };
    const manager = {
      findOne: jest.fn(async () => wallet),
      create: jest.fn((_entity: any, payload: any) => payload),
      save: jest.fn(async (_entity: any, payload: any) => payload),
    };

    const result = await service.debitWithManager(
      manager as any,
      167,
      350,
      { operation: 'entry-cycle' },
      { allowDebt: true },
    );

    expect(result).toEqual({
      chargedCredits: 350,
      summary: {
        total: 5_000,
        used: 5_150,
        remaining: 0,
        debt: 150,
        revoked: 0,
      },
    });
    expect(manager.save).toHaveBeenCalledWith(
      CreditWallet,
      expect.objectContaining({ balance: -150, totalSpent: 5_150 }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      CreditLedgerEntry,
      expect.objectContaining({ amount: -350, balanceAfter: -150 }),
    );
  });

  it('creates a debt wallet when an authorized cycle has no purchased wallet', async () => {
    const manager = {
      findOne: jest.fn(async () => null),
      create: jest.fn((_entity: any, payload: any) => payload),
      save: jest.fn(async (_entity: any, payload: any) => payload),
    };

    const result = await service.debitWithManager(
      manager as any,
      167,
      25,
      { operation: 'entry-cycle' },
      { allowDebt: true },
    );

    expect(result).toEqual({
      chargedCredits: 25,
      summary: {
        total: 0,
        used: 25,
        remaining: 0,
        debt: 25,
        revoked: 0,
      },
    });
    expect(manager.save).toHaveBeenCalledWith(
      CreditWallet,
      expect.objectContaining({
        userId: 167,
        balance: -25,
        totalSpent: 25,
      }),
    );
  });

  it('settles wallet debt from a new plan and records the transfer', async () => {
    const wallet = {
      id: 41,
      userId: 167,
      balance: -100,
      totalPurchased: 0,
      totalSpent: 100,
      totalRevoked: 0,
    };
    const manager = {
      findOne: jest.fn(async () => wallet),
      create: jest.fn((_entity: any, payload: any) => payload),
      save: jest.fn(async (_entity: any, payload: any) => payload),
    };

    const result = await service.settleDebtWithManager(
      manager as any,
      167,
      30_000,
      { basePlanId: 'base-m1' },
    );

    expect(result).toEqual({
      settledCredits: 100,
      summary: {
        total: 0,
        used: 0,
        remaining: 0,
        debt: 0,
        revoked: 0,
      },
    });
    expect(manager.save).toHaveBeenCalledWith(
      CreditWallet,
      expect.objectContaining({ balance: 0, totalSpent: 0 }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      CreditLedgerEntry,
      expect.objectContaining({
        type: 'ADJUSTMENT',
        amount: 100,
        balanceAfter: 0,
        metadata: expect.objectContaining({
          reason: 'SUBSCRIPTION_DEBT_SETTLEMENT',
          basePlanId: 'base-m1',
        }),
      }),
    );
  });

  it('settles only the credits available in the plan when debt is larger', async () => {
    const wallet = {
      id: 41,
      userId: 167,
      balance: -200,
      totalPurchased: 0,
      totalSpent: 200,
      totalRevoked: 0,
    };
    const manager = {
      findOne: jest.fn(async () => wallet),
      create: jest.fn((_entity: any, payload: any) => payload),
      save: jest.fn(async (_entity: any, payload: any) => payload),
    };

    const result = await service.settleDebtWithManager(manager as any, 167, 75);

    expect(result).toEqual({
      settledCredits: 75,
      summary: {
        total: 0,
        used: 125,
        remaining: 0,
        debt: 125,
        revoked: 0,
      },
    });
  });

  it('reports refund debt without exposing a negative remaining balance', () => {
    expect(
      service.toSummary({
        balance: -1_200,
        totalPurchased: 5_000,
        totalSpent: 5_000,
        totalRevoked: 5_000,
      } as CreditWallet),
    ).toEqual({
      total: 0,
      used: 5_000,
      remaining: 0,
      debt: 1_200,
      revoked: 5_000,
    });
  });
});
