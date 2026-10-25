import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import {
  DataSource,
  getMetadataArgsStorage,
  SelectQueryBuilder,
} from 'typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import {
  buildAdminUserOverviewQuery,
  getAdminUserOverview,
} from './admin-user-overview';
import {
  canStoreSubscriptionGrantAccess,
  STORE_ACCESS_BILLING_STATUSES,
} from '../subscriptions/store-subscription-access';
import { SubscriptionBillingStatus } from '../subscriptions/types';

describe('Admin user overview', () => {
  let source: DataSource;
  const now = new Date('2026-10-26T12:00:00Z');
  beforeAll(async () => {
    expect(UsersService).toBeDefined(); // Load the application's relation metadata.
    source = new DataSource({
      type: 'postgres',
      entities: getMetadataArgsStorage()
        .tables.map((table) => table.target)
        .filter((target) => typeof target === 'function'),
    });
    await (source as any).buildMetadatas();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses one aggregate and single-row plan selection, preserving Kyiv timestamp types', () => {
    const query = buildAdminUserOverviewQuery(source.getRepository(User), now);
    const [sql, params] = query.getQueryAndParameters();
    expect(sql).toContain('COUNT(*)');
    expect(sql).toContain('"ups"."id" IS NULL AND "lp"."id" = (SELECT');
    expect(sql).toContain('"p"."actual" = true');
    expect(sql).toContain('NULLS LAST');
    expect(sql).toContain('LIMIT 1');
    expect(sql).toContain('"wallet"."balance" > 0');
    expect(sql).toContain('"u"."createdAt" AT TIME ZONE \'UTC\'');
    expect(sql).toContain('"u"."lastActiveAt" AT TIME ZONE');
    expect(sql).toContain(' - 29');
    expect(sql).toContain('"u"."lastActiveAt" <= CAST(');
    expect(sql).not.toContain('"u"."lastActiveAt" AT TIME ZONE \'UTC\'');
    expect(sql).not.toMatch(/payments|entries_stats|purchaseToken/);
    expect(params).toEqual(
      expect.arrayContaining([
        now.toISOString(),
        'Europe/Kyiv',
        'ad-free-y1',
        'start-d7',
      ]),
    );
  });

  it('returns all paid tiers including zero-count annual AdFree and keeps totals distinct', async () => {
    jest.spyOn(SelectQueryBuilder.prototype, 'getRawOne').mockResolvedValue({
      total: '40',
      active: '9',
      trial: '3',
      purchasedCredits: '4',
      activeFrom: '2026-09-27',
      activeTo: '2026-10-26',
      plan0: '2',
      plan1: '1',
      plan2: '0',
      plan3: '3',
      plan4: '4',
    });
    const result = await getAdminUserOverview(source.getRepository(User), now);
    expect(result).toMatchObject({
      total: 40,
      active: 9,
      trial: 3,
      purchasedCredits: 4,
      subscribed: 10,
      activePeriod: {
        from: '2026-09-27',
        to: '2026-10-26',
        timezone: 'Europe/Kyiv',
        days: 30,
      },
    });
    expect(result.subscriptions).toHaveLength(5);
    expect(result.subscriptions).toContainEqual({
      basePlanId: 'ad-free-y1',
      name: 'AdFree',
      count: 0,
    });
  });

  it.each(Object.values(SubscriptionBillingStatus))(
    'uses the existing paid-period status rule for %s',
    (status) => {
      expect(canStoreSubscriptionGrantAccess(status, null, now)).toBe(
        STORE_ACCESS_BILLING_STATUSES.some((value) => value === status),
      );
      expect(canStoreSubscriptionGrantAccess(status, now, now)).toBe(false);
    },
  );
});
