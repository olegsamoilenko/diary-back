import { describe, expect, it, jest } from '@jest/globals';
import { In } from 'typeorm';
import { UserStatisticsService } from './user-statistics.service';
import { UserStatisticsController } from './user-statistics.controller';

function setup(empty = false) {
  const activity: any = {};
  for (const method of [
    'innerJoinAndSelect',
    'leftJoinAndSelect',
    'leftJoinAndMapOne',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'leftJoin',
    'select',
    'addSelect',
    'groupBy',
  ]) {
    activity[method] = jest.fn().mockReturnValue(activity);
  }
  activity.getMany = jest.fn<() => Promise<any[]>>().mockResolvedValue(
    empty
      ? []
      : [
          { id: 1, day: '2026-10-21', userId: 7, user: { id: 7 } },
          { id: 2, day: '2026-10-22', userId: 7, user: { id: 7 } },
        ],
  );
  activity.getRawMany = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
  const counts: any = {};
  for (const method of ['select', 'loadRelationCountAndMap', 'where'])
    counts[method] = jest.fn().mockReturnValue(counts);
  counts.getMany = jest.fn<() => Promise<any[]>>().mockResolvedValue([
    {
      id: 7,
      entriesStatsCount: 1000,
      dialogsStatsCount: 2000,
      checkinsStatsCount: 300,
      checkinDialogsStatsCount: 400,
      goalsStatsCount: 50,
      forumCommentsCount: 6,
      forumTopicsCount: 2,
    },
  ]);
  const legacy = {
    id: 7,
    entriesStats: [{ id: 11 }],
    dialogsStats: [{ id: 12 }],
    checkinsStats: [{ id: 13 }],
    checkinDialogsStats: [{ id: 14 }],
    goalsStats: [{ id: 15 }],
  };
  const users = {
    createQueryBuilder: jest.fn().mockReturnValue(counts),
    find: jest.fn<() => Promise<any[]>>().mockResolvedValue([legacy]),
  };
  const service = new UserStatisticsService(
    users as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { createQueryBuilder: () => activity } as any,
  );
  return { service, users, counts, activity, legacy };
}

describe('admin activity records without Cartesian statistics joins', () => {
  it('returns compact counts without loading any statistic collection', async () => {
    const { service, users, counts } = setup();
    const result: any = await service.getUsersActivityRecords(
      '2026-10-21',
      '2026-10-22',
      'all',
      true,
    );
    expect(users.find).not.toHaveBeenCalled();
    expect(counts.where).toHaveBeenCalledWith('user.id IN (:...userIds)', {
      userIds: [7],
    });
    expect(counts.loadRelationCountAndMap).toHaveBeenCalledTimes(7);
    expect(result).toHaveLength(2);
    for (const record of result) {
      expect(record.user).toMatchObject({
        entriesStatsCount: 1000,
        dialogsStatsCount: 2000,
        checkinsStatsCount: 300,
        checkinDialogsStatsCount: 400,
        goalsStatsCount: 50,
        forumCommentsStats: 6,
        forumTopicsStats: 2,
      });
      expect(record.user.entriesStats).toBeUndefined();
    }
    expect(JSON.stringify(result).length).toBeLessThan(1500);
  });

  it('preserves legacy arrays using separate relation queries by default', async () => {
    const { service, users, legacy } = setup();
    const result: any = await service.getUsersActivityRecords(
      '2026-10-21',
      '2026-10-22',
      'all',
    );
    expect(users.find).toHaveBeenCalledWith({
      where: { id: In([7]) },
      relationLoadStrategy: 'query',
      relations: [
        'goalsStats',
        'dialogsStats',
        'entriesStats',
        'checkinsStats',
        'checkinDialogsStats',
      ],
    });
    expect(result[0].user).toMatchObject(legacy);
  });

  it('skips all lifetime-stat queries when the period is empty', async () => {
    const { service, users } = setup(true);
    expect(
      await service.getUsersActivityRecords(
        '2026-10-21',
        '2026-10-22',
        'all',
        true,
      ),
    ).toEqual([]);
    expect(users.find).not.toHaveBeenCalled();
    expect(users.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('keeps without-plan alternatives inside the date filter on both queries', async () => {
    const { service, activity } = setup();
    await service.getUsersActivityStatsByDays(
      '2026-10-21',
      '2026-10-22',
      'withoutPlan',
    );
    await service.getUsersActivityRecords(
      '2026-10-21',
      '2026-10-22',
      'withoutPlan',
      true,
    );
    const clauses = activity.andWhere.mock.calls
      .map((call: any[]) => String(call[0]).trim())
      .filter((sql: string) => sql.includes('ap.id IS NULL'));
    expect(clauses).toHaveLength(2);
    for (const sql of clauses) {
      expect(sql.startsWith('(')).toBe(true);
      expect(sql.endsWith(')')).toBe(true);
    }
  });

  it('only opts into compact output for an explicit boolean true', async () => {
    const getUsersActivityRecords = jest
      .fn<() => Promise<any[]>>()
      .mockResolvedValue([]);
    const controller = new UserStatisticsController({
      getUsersActivityRecords,
    } as any);
    await controller.getUsersActivityRecords({
      startDate: '2026-10-21',
      endDate: '2026-10-22',
      type: 'all',
      compact: true,
    });
    expect(getUsersActivityRecords).toHaveBeenLastCalledWith(
      '2026-10-21',
      '2026-10-22',
      'all',
      true,
    );
    await controller.getUsersActivityRecords({
      startDate: '2026-10-21',
      endDate: '2026-10-22',
      type: 'all',
    });
    expect(getUsersActivityRecords).toHaveBeenLastCalledWith(
      '2026-10-21',
      '2026-10-22',
      'all',
      false,
    );
  });
});
