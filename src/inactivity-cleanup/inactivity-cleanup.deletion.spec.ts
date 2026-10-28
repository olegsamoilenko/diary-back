import { expect, it, jest } from '@jest/globals';
import { InactivityCleanupCronService } from './inactivity-cleanup.cron.service';
import {
  SubscriptionAccessStatus,
  SubscriptionSource,
} from '../subscriptions/types';

it('still deletes eligible inactive users internally and rechecks active/paid candidates', async () => {
  const old = new Date(Date.now() - 181 * 86400000);
  const candidates = [
    { id: 11, lastActiveAt: old },
    { id: 12, lastActiveAt: old },
    { id: 13, lastActiveAt: old },
  ];
  const query: Record<string, any> = {};
  for (const method of [
    'leftJoin',
    'where',
    'andWhere',
    'setParameters',
    'orderBy',
    'limit',
    'select',
  ]) {
    query[method] = jest.fn(() => query);
  }
  query.getMany = jest
    .fn<() => Promise<unknown[]>>()
    .mockResolvedValueOnce([]) // No warning candidates.
    .mockResolvedValueOnce(candidates)
    .mockResolvedValueOnce([]);
  const usersRepo = {
    createQueryBuilder: jest.fn(() => query),
    findOne: jest.fn(async ({ where }: { where: { id: number } }) => ({
      id: where.id,
      lastActiveAt: where.id === 12 ? new Date() : old,
      email: null,
    })),
  };
  const plansRepo = {
    findOne: jest.fn(async ({ where }: { where: { userId: number } }) =>
      where.userId === 13
        ? {
            source: SubscriptionSource.GOOGLE_PLAY,
            accessStatus: SubscriptionAccessStatus.ACTIVE,
            useWithoutSubscription: false,
            expiryTime: new Date(Date.now() + 86400000),
          }
        : null,
    ),
  };
  const deleteUser = jest.fn(async (_id: number) => undefined);
  const redis = { set: jest.fn(async () => 'OK'), del: jest.fn(async () => 1) };
  const service = new InactivityCleanupCronService(
    usersRepo as any,
    plansRepo as any,
    {} as any,
    { deleteUser } as any,
    redis as any,
  );

  await service.runDaily();

  expect(deleteUser).toHaveBeenCalledTimes(1);
  expect(deleteUser).toHaveBeenCalledWith(11);
  expect(redis.del).toHaveBeenCalledWith('cron:inactive-cleanup:lock');
});
