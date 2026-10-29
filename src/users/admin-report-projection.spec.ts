import { describe, expect, it, jest } from '@jest/globals';
import { UserMonitoringService } from '../user-monitoring/user-monitoring.service';
import { UserStatisticsService } from '../user-statistics/user-statistics.service';
import { toAdminUser } from './admin-user-projection';
import type { User } from './entities/user.entity';

const date = new Date('2026-10-01T00:00:00Z');
const credentials = {
  password: 'SENSITIVE-password',
  hash: 'SENSITIVE-hash',
  salt: 'SENSITIVE-salt',
  passwordResetCode: 'SENSITIVE-reset',
  passwordChangeToken: 'SENSITIVE-change',
  emailVerificationCode: 'SENSITIVE-email',
  newEmailVerificationCode: 'SENSITIVE-new-email',
  phoneVerificationCode: 'SENSITIVE-phone',
  deleteAccountVerificationCode: 'SENSITIVE-delete',
  resetPinVerificationCode: 'SENSITIVE-pin',
  dekEncrypted: 'SENSITIVE-dek',
  sessions: ['SENSITIVE-session'],
  oauthProviderId: 'SENSITIVE-provider',
  futureSecret: 'SENSITIVE-future',
};
const user = {
  id: 7,
  uuid: 'synthetic-user',
  name: 'Synthetic User',
  email: 'test@example.com',
  regionCode: 'UA',
  createdAt: date,
  lastActiveAt: date,
  usesWithoutSubscription: false,
  acquisitionMetaJson: { media_source: 'organic' },
  ...credentials,
  settings: {
    id: 2,
    lang: 'uk',
    appBuild: 270,
    user: credentials,
    ...credentials,
  },
  payments: [
    {
      id: 3,
      orderId: 'synthetic-order',
      amount: '20.00',
      currency: 'UAH',
      user: credentials,
      plan: credentials,
      ...credentials,
    },
  ],
  plans: [
    {
      id: 4,
      name: 'lite',
      planStatus: 'active',
      startTime: date,
      expiryTime: date,
      purchaseToken: 'SENSITIVE-purchase',
      linkedPurchaseToken: 'SENSITIVE-linked',
      user: credentials,
    },
  ],
  forumPublicProfile: {
    id: 'synthetic-profile',
    displayName: 'Synthetic',
    user: credentials,
    ...credentials,
  },
  goalsStats: [{ id: 8, createdAt: date, user: credentials }],
  subscriptionState: {
    id: 9,
    name: 'lite-m1',
    basePlanId: 'lite-m1',
    startTime: date,
    expiryTime: date,
    creditsLimit: 100,
    usedCredits: 10,
    metadata: { accessReason: 'NONE', purchaseToken: 'SENSITIVE-purchase' },
  },
};
const safe = (result: unknown) =>
  expect(JSON.stringify(result)).not.toContain('SENSITIVE-');

// Query terminals are fixtures; all filtering/mapping runs in the real service.
function query(terminals: Record<string, unknown>) {
  const chain: Record<string, unknown> = {};
  const proxy = new Proxy(chain, {
    get: (target, key: string) => {
      if (!(key in target))
        target[key] =
          key in terminals
            ? jest.fn(async () => terminals[key])
            : jest.fn(() => proxy);
      return target[key];
    },
  });
  return proxy;
}
function statistics(records: unknown[], compact = false) {
  const activity = query({ getMany: records });
  const counters = query({
    getMany: [
      {
        id: 7,
        entriesStatsCount: 12,
        dialogsStatsCount: 4,
        checkinsStatsCount: 2,
        checkinDialogsStatsCount: 3,
        goalsStatsCount: 1,
        forumCommentsCount: 8,
        forumTopicsCount: 9,
      },
    ],
  });
  const paid = query({
    getRawOne: { count: '1' },
    getRawMany: [{ id: 7 }],
    getMany: [user],
  });
  const users = {
    createQueryBuilder: jest.fn((alias: string) =>
      alias === 'user' ? counters : paid,
    ),
    find: jest.fn(async () => [
      {
        id: 7,
        entriesStats: [{ id: 11, createdAt: date, user: credentials }],
        dialogsStats: [],
        checkinsStats: [],
        checkinDialogsStats: [],
        goalsStats: [],
      },
    ]),
  };
  const service = new UserStatisticsService(
    users as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { createQueryBuilder: () => activity } as never,
  );
  return { service, users, compact };
}

describe('NA-02/09 safe admin response contracts', () => {
  it('preserves table identity, settings, payment details and forum display but excludes credential relations', () => {
    const result = toAdminUser(user as unknown as User);
    safe(result);
    expect(result).toMatchObject({
      id: 7,
      uuid: 'synthetic-user',
      name: 'Synthetic User',
      email: 'test@example.com',
      regionCode: 'UA',
      createdAt: date,
      settings: { lang: 'uk', appBuild: 270 },
      payments: [
        { id: 3, orderId: 'synthetic-order', amount: '20.00', currency: 'UAH' },
      ],
      forumPublicProfile: { displayName: 'Synthetic' },
    });
    expect(user.password).toBe('SENSITIVE-password'); // Never mutate an entity used by auth.
  });
  it('projects the saved monitoring response as well as the list', async () => {
    const item = {
      id: 17,
      type: 'all',
      description: 'Synthetic monitor',
      user,
    };
    const repo = {
      create: jest.fn(() => item),
      save: jest.fn(async () => item),
      createQueryBuilder: () =>
        query({
          getRawAndEntities: {
            entities: [item],
            raw: [
              {
                user_id: 7,
                entries_stats_count: '12',
                dialogs_stats_count: '4',
                checkins_stats_count: '2',
                checkin_dialogs_stats_count: '3',
              },
            ],
          },
        }),
    };
    const service = new UserMonitoringService(
      repo as never,
      { findByUUID: async () => user } as never,
    );
    safe(
      await service.addToMonitoring(
        'synthetic-user',
        'all' as never,
        'Synthetic monitor',
      ),
    );
    const result = await service.getAll('all' as never);
    safe(result);
    expect(result[0]).toMatchObject({
      id: 17,
      description: 'Synthetic monitor',
      user: {
        id: 7,
        uuid: 'synthetic-user',
        entriesStatsCount: 12,
        dialogsStatsCount: 4,
        checkinsStatsCount: 2,
        checkinDialogsStatsCount: 3,
        plan: {
          name: 'lite',
          planStatus: 'active',
          startTime: date,
          expiryTime: date,
        },
      },
    });
  });
  it.each([false, true])(
    'preserves activity and lifetime counts for compact=%s without secrets',
    async (compact) => {
      const { service, users } = statistics([
        { id: 1, userId: 7, user, day: '2026-10-01', entries: 2 },
      ]);
      const result = await service.getUsersActivityRecords(
        '2026-10-01',
        '2026-10-29',
        'all',
        compact,
      );
      safe(result);
      expect(result[0]).toMatchObject({
        id: 1,
        day: '2026-10-01',
        entries: 2,
        user: {
          uuid: 'synthetic-user',
          entriesStatsCount: 12,
          dialogsStatsCount: 4,
          forumTopicsStats: 9,
          forumCommentsStats: 8,
          plan: { name: 'lite-m1', creditsLimit: 100 },
        },
      });
      if (compact) expect(users.find).not.toHaveBeenCalled();
      else
        expect(result[0]).toMatchObject({
          user: { entriesStats: [{ id: 11, createdAt: date }] },
        });
    },
  );
  it('also filters the activity fallback with no joined userId', async () => {
    const { service } = statistics([{ id: 1, userId: null, user }]);
    safe(
      await service.getUsersActivityRecords('2026-10-01', '2026-10-29', 'all'),
    );
  });
  it('preserves paid profile paging and subscription fields', async () => {
    const { service } = statistics([]);
    const result = await service.getPaidUsersProfile(1, 20);
    safe(result);
    expect(result).toMatchObject({
      total: 1,
      page: 1,
      limit: 20,
      pageCount: 1,
      users: [
        {
          id: 7,
          uuid: 'synthetic-user',
          plan: { name: 'lite-m1', usedCredits: 10 },
        },
      ],
    });
  });
  it('handles absent optional relations without changing identity', () => {
    expect(
      toAdminUser({
        id: 7,
        uuid: 'synthetic-user',
        settings: null,
      } as unknown as User),
    ).toMatchObject({ id: 7, uuid: 'synthetic-user', settings: null });
  });
});
