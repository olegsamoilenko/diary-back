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
