import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { CreditLedgerEntry } from './entities/credit-ledger-entry.entity';
import { CreditWallet } from './entities/credit-wallet.entity';
import { CreditLedgerEntryType, PurchasedCreditsSummary } from './types';

@Injectable()
export class CreditWalletService {
  constructor(
    @InjectRepository(CreditWallet)
    private readonly walletsRepository: Repository<CreditWallet>,
  ) {}

  async getSummary(
    userId: number,
    manager?: EntityManager,
  ): Promise<PurchasedCreditsSummary> {
    const wallet = manager
      ? await manager.findOne(CreditWallet, { where: { userId } })
      : await this.walletsRepository.findOne({ where: { userId } });

    return this.toSummary(wallet);
  }

  async debitWithManager(
    manager: EntityManager,
    userId: number,
    requestedCredits: number,
    metadata: Record<string, unknown> | null = null,
  ) {
    const requested = Math.max(0, Math.round(requestedCredits));
    const wallet = await manager.findOne(CreditWallet, {
      where: { userId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!wallet || requested === 0) {
      return {
        chargedCredits: 0,
        summary: this.toSummary(wallet),
      };
    }

    const available = Math.max(0, wallet.balance);
    const chargedCredits = Math.min(requested, available);

    if (chargedCredits === 0) {
      return {
        chargedCredits,
        summary: this.toSummary(wallet),
      };
    }

    wallet.balance -= chargedCredits;
    wallet.totalSpent += chargedCredits;
    const savedWallet = await manager.save(CreditWallet, wallet);

    await manager.save(
      CreditLedgerEntry,
      manager.create(CreditLedgerEntry, {
        userId,
        walletId: savedWallet.id,
        purchaseId: null,
        type: CreditLedgerEntryType.AI_USAGE,
        amount: -chargedCredits,
        balanceAfter: savedWallet.balance,
        idempotencyKey: `ai-usage:${randomUUID()}`,
        metadata,
      }),
    );

    return {
      chargedCredits,
      summary: this.toSummary(savedWallet),
    };
  }

  toSummary(wallet: CreditWallet | null): PurchasedCreditsSummary {
    if (!wallet) {
      return { total: 0, used: 0, remaining: 0, debt: 0, revoked: 0 };
    }

    return {
      total: Math.max(0, wallet.totalPurchased - wallet.totalRevoked),
      used: wallet.totalSpent,
      remaining: Math.max(0, wallet.balance),
      debt: Math.max(0, -wallet.balance),
      revoked: Math.max(0, wallet.totalRevoked),
    };
  }
}
