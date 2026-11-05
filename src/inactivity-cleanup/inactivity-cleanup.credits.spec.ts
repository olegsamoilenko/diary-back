import { describe, expect, it, jest } from '@jest/globals';
import { InactivityCleanupCronService } from './inactivity-cleanup.cron.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { CreditWallet } from '../credits/entities/credit-wallet.entity';
import {
  SubscriptionAccessStatus,
  SubscriptionSource,
} from '../subscriptions/types';

// Synthetic repositories only: no accounts, payments, emails or production DB.
function fixture(options: {
  phase: 'warning' | 'deletion';
  balance: number | null;
  lockedBalance?: number;
  lockedActive?: boolean;
  lockedPaid?: boolean;
  walletError?: boolean;
  deletionError?: boolean;
}) {
  const user = {
    id: 42,
    email: 'fixture@example.com',
    settings: { lang: 'en' },
    lastActiveAt: new Date(
      Date.now() - (options.phase === 'warning' ? 160 : 190) * 86400000,
    ),
    inactivityWarnedAt: null,
  };
  const qb: Record<string, any> = {};
  for (const method of [
    'leftJoin',
    'where',
    'andWhere',
    'setParameters',
    'orderBy',
    'limit',
    'select',
  ]) {
    qb[method] = jest.fn(() => qb);
  }
  qb.getMany = jest
    .fn<() => Promise<unknown[]>>()
    .mockResolvedValueOnce(options.phase === 'warning' ? [user] : [])
    .mockResolvedValueOnce(options.phase === 'warning' ? [] : [user])
    .mockResolvedValue([]);
  const transactionRepo = {
    delete: jest.fn(async () => {
      if (options.deletionError) throw new Error('rollback fixture');
      return { affected: 1 };
    }),
  };
  const manager = {
    findOne: jest.fn(async (entity: unknown) => {
      if (entity === User)
        return {
          ...user,
          lastActiveAt: options.lockedActive ? new Date() : user.lastActiveAt,
        };
      if (entity === CreditWallet) {
        if (options.walletError) throw new Error('wallet unavailable');
        const balance = options.lockedBalance ?? options.balance;
        return balance === null ? null : { balance };
      }
      return options.lockedPaid
        ? {
            source: SubscriptionSource.GOOGLE_PLAY,
            accessStatus: SubscriptionAccessStatus.ACTIVE,
            useWithoutSubscription: false,
            expiryTime: new Date(Date.now() + 86400000),
          }
        : null;
    }),
    getRepository: jest.fn(() => transactionRepo),
  };
  const usersRepo = {
    createQueryBuilder: jest.fn(() => qb),
    findOne: jest.fn(async () => user),
    findOneBy: jest.fn(async () => user),
    update: jest.fn(async () => undefined),
    delete: jest.fn(async () => undefined),
    manager: { transaction: jest.fn(async (run: any) => run(manager)) },
  };
  const cleanup = jest.fn(async () => undefined);
  const usersService = Object.assign(Object.create(UsersService.prototype), {
    usersRepository: usersRepo,
    usersSettingsRepository: { delete: jest.fn(async () => undefined) },
    tokensService: { deleteByUserId: cleanup },
    plansService: { deleteByUserId: cleanup },
    saltService: { deleteSaltByUserId: cleanup },
    sessionsService: { deleteByUserId: cleanup },
    commonNotificationsService: { deleteReadNotificationsByUserId: cleanup },
    releaseNotificationsService: { deleteSkippedVersionsByUserId: cleanup },
  });
  const send = jest.fn(async () => undefined);
  const walletRepo = {
    findOne: jest.fn(async () => {
      if (options.walletError) throw new Error('wallet unavailable');
      return options.balance === null ? null : { balance: options.balance };
    }),
  };
  const redis = { set: jest.fn(async () => 'OK'), del: jest.fn(async () => 1) };
  const service = new InactivityCleanupCronService(
    usersRepo as any,
    { findOne: async () => null } as any,
    { send } as any,
    usersService,
    redis as any,
    walletRepo as any,
  );
  return {
    service,
    usersService,
    usersRepo,
    manager,
    qb,
    cleanup,
    transactionRepo,
    send,
    redis,
  };
}

describe('Purchased credits protect inactive accounts', () => {
  it.each(['warning', 'deletion'] as const)(
    'protects even one remaining credit during %s',
    async (phase) => {
      const f = fixture({ phase, balance: 1 });
      await f.service.runDaily();
      expect(f.usersRepo.update).not.toHaveBeenCalled();
      expect(f.cleanup).not.toHaveBeenCalled();
      expect(f.transactionRepo.delete).not.toHaveBeenCalled();
      expect(f.send).not.toHaveBeenCalled();
      expect(f.qb.andWhere).toHaveBeenCalledWith(
        '(w.id IS NULL OR w.balance <= 0)',
      );
    },
  );

  it.each([null, 0, -100])(
    'preserves warning and deletion eligibility for balance %s',
    async (balance) => {
      const warning = fixture({ phase: 'warning', balance });
      await warning.service.runDaily();
      expect(warning.usersRepo.update).toHaveBeenCalledTimes(1);
      expect(warning.send).toHaveBeenCalledTimes(1);
      const deletion = fixture({ phase: 'deletion', balance });
      await deletion.service.runDaily();
      expect(deletion.transactionRepo.delete).toHaveBeenCalledWith(42);
      expect(deletion.cleanup).toHaveBeenCalledTimes(6);
      expect(deletion.cleanup).toHaveBeenCalledWith(42, deletion.manager);
      expect(deletion.usersRepo.delete).not.toHaveBeenCalled();
      expect(deletion.send).toHaveBeenCalledTimes(1);
    },
  );

  it('rechecks a purchase committed after candidate selection under the grant user lock', async () => {
    const f = fixture({ phase: 'deletion', balance: 0, lockedBalance: 500 });
    await f.service.runDaily();
    expect(f.manager.findOne).toHaveBeenCalledWith(User, {
      where: { id: 42 },
      lock: { mode: 'pessimistic_write' },
    });
    expect(f.manager.findOne).toHaveBeenCalledWith(CreditWallet, {
      where: { userId: 42 },
      lock: { mode: 'pessimistic_write' },
    });
    expect(f.cleanup).not.toHaveBeenCalled();
    expect(f.send).not.toHaveBeenCalled();
  });

  it.each([{ lockedActive: true }, { lockedPaid: true }])(
    'rechecks activity and subscription inside deletion transaction: %j',
    async (state) => {
      const f = fixture({ phase: 'deletion', balance: 0, ...state });
      await f.service.runDaily();
      expect(f.cleanup).not.toHaveBeenCalled();
      expect(f.send).not.toHaveBeenCalled();
    },
  );

  it.each(['warning', 'deletion'] as const)(
    'fails closed when the wallet lookup fails during %s',
    async (phase) => {
      const f = fixture({ phase, balance: 0, walletError: true });
      await f.service.runDaily();
      expect(f.cleanup).not.toHaveBeenCalled();
      expect(f.send).not.toHaveBeenCalled();
      expect(f.redis.del).toHaveBeenCalled();
    },
  );

  it('propagates a deletion failure out of the transaction and does not send a success email', async () => {
    const f = fixture({ phase: 'deletion', balance: 0, deletionError: true });
    await f.service.runDaily();
    await expect(
      f.usersRepo.manager.transaction.mock.results[0].value,
    ).rejects.toThrow('rollback fixture');
    expect(f.send).not.toHaveBeenCalled();
  });

  it('still allows explicit user deletion with a positive purchased balance', async () => {
    const f = fixture({ phase: 'deletion', balance: 100 });
    await f.usersService.deleteUser(42);
    expect(f.usersRepo.delete).toHaveBeenCalledWith(42);
    expect(f.usersRepo.manager.transaction).not.toHaveBeenCalled();
  });
});
