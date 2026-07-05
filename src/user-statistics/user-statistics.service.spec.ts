import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { UserStatisticsService } from './user-statistics.service';
import {
  SubscriptionBasePlanId,
  SubscriptionBillingStatus,
  SubscriptionSource,
} from 'src/subscriptions/types';

describe('UserStatisticsService', () => {
  const usersRepository = {
    createQueryBuilder: jest.fn(),
  };

  let service: UserStatisticsService;
  let joinCalls: Array<{
    relation: unknown;
    alias: string;
    condition: string;
    params: Record<string, unknown>;
  }>;

  beforeEach(() => {
    jest.clearAllMocks();
    joinCalls = [];
    const counts = ['1', '2', '3', '4', '5', '6', '7', '8'];

    (usersRepository.createQueryBuilder as any).mockImplementation(() => {
      const qb = {
        innerJoin: jest.fn(
          (
            relation: unknown,
            alias: string,
            condition: string,
            params: Record<string, unknown>,
          ) => {
            joinCalls.push({ relation, alias, condition, params });
            return qb;
          },
        ),
        leftJoin: jest.fn(() => qb),
        where: jest.fn(() => qb),
        andWhere: jest.fn(() => qb),
        select: jest.fn(() => qb),
        getRawOne: jest.fn(async () => ({ count: counts.shift() ?? '0' })),
      };
      return qb;
    });

    service = new UserStatisticsService(
      usersRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('counts paid users by plan from user_plan_states only for active paid billing statuses', async () => {
    const result = await service.getUserCount();

    expect(result.liteUsers).toBe(5);
    expect(result.baseUsers).toBe(6);
    expect(result.proUsers).toBe(7);
    expect(result.totalPaidUsers).toBe(18);

    for (const [planParam, planId] of [
      ['lite', SubscriptionBasePlanId.LITE_M1],
      ['base', SubscriptionBasePlanId.BASE_M1],
      ['pro', SubscriptionBasePlanId.PRO_M1],
    ] as const) {
      const call = joinCalls.find(
        ({ params }) => params[planParam] === planId,
      );

      expect(call).toBeDefined();
      expect(call?.alias).toBe('s');
      expect(call?.condition).toContain(`s.basePlanId = :${planParam}`);
      expect(call?.condition).toContain(
        's.billingStatus IN (:...activeBillingStatuses)',
      );
      expect(call?.condition).toContain('s.source IN (:...paidSources)');
      expect(call?.condition).not.toContain('p.actual');
      expect(call?.condition).not.toContain('p.planStatus');
      expect(call?.params).toEqual(
        expect.objectContaining({
          [planParam]: planId,
          paidSources: [
            SubscriptionSource.GOOGLE_PLAY,
            SubscriptionSource.APP_STORE,
          ],
          activeBillingStatuses: [
            SubscriptionBillingStatus.ACTIVE,
            SubscriptionBillingStatus.IN_GRACE,
            SubscriptionBillingStatus.CANCELED,
          ],
        }),
      );
    }
  });
});
