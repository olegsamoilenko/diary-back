import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { UserStatisticsService } from './user-statistics.service';
import { BasePlanIds, PlanStatus } from 'src/plans/types';

describe('UserStatisticsService', () => {
  const usersRepository = {
    createQueryBuilder: jest.fn(),
  };

  let service: UserStatisticsService;
  let joinCalls: Array<{
    relation: string;
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
            relation: string,
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

  it('counts paid users by plan only for subscribed plan statuses', async () => {
    const result = await service.getUserCount();

    expect(result.liteUsers).toBe(5);
    expect(result.baseUsers).toBe(6);
    expect(result.proUsers).toBe(7);
    expect(result.totalPaidUsers).toBe(18);

    for (const [planParam, planId] of [
      ['lite', BasePlanIds.LITE_M1],
      ['base', BasePlanIds.BASE_M1],
      ['pro', BasePlanIds.PRO_M1],
    ] as const) {
      const call = joinCalls.find(
        ({ params }) => params[planParam] === planId,
      );

      expect(call).toBeDefined();
      expect(call?.condition).toContain('p.actual = true');
      expect(call?.condition).toContain(`p.basePlanId = :${planParam}`);
      expect(call?.condition).toContain(
        'p.planStatus IN (:...subscribedStatuses)',
      );
      expect(call?.condition).not.toContain('OR p.planStatus');
      expect(call?.params).toEqual(
        expect.objectContaining({
          [planParam]: planId,
          subscribedStatuses: [
            PlanStatus.ACTIVE,
            PlanStatus.TOKEN_EXCEEDED,
            PlanStatus.CREDIT_EXCEEDED,
          ],
        }),
      );
    }
  });
});
