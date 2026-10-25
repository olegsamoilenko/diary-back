import { describe, expect, it, jest } from '@jest/globals';
import { UsersService } from './users.service';
import { PlannerCreationStat } from '../planner-statistics/entities/planner-creation-stat.entity';
import { PLANNER_TYPES } from '../planner-statistics/planner-statistics.dto';

describe('admin user creation statistics', () => {
  function setup(empty = false) {
    const list: any = {};
    for (const method of [
      'leftJoinAndSelect',
      'leftJoinAndMapOne',
      'andWhere',
      'addSelect',
      'clone',
      'orderBy',
      'addOrderBy',
      'take',
      'skip',
      'select',
      'distinct',
      'loadRelationCountAndMap',
    ])
      list[method] = jest.fn().mockReturnValue(list);
    list.getCount = jest
      .fn<() => Promise<number>>()
      .mockResolvedValue(empty ? 0 : 2);
    list.getRawAndEntities = jest.fn<() => Promise<any>>().mockResolvedValue({
      entities: empty
        ? []
        : [
            { id: 12, plans: [{ id: 3 }], goalsStats: [{ id: 1 }, { id: 2 }] },
            { id: 13, plans: [] },
          ],
      // Multiple joined payments/legacy stats must not multiply counters.
      raw: empty
        ? []
        : [0, 1].map(() => ({
            u_id: '12',
            entries_stats_count: '9',
            dialogs_stats_count: '8',
            checkins_stats_count: '7',
            checkin_dialogs_stats_count: '6',
          })),
    });
    const planner: any = {};
    for (const method of [
      'select',
      'addSelect',
      'where',
      'groupBy',
      'addGroupBy',
    ]) {
      planner[method] = jest.fn().mockReturnValue(planner);
    }
    planner.getRawMany = jest.fn<() => Promise<any[]>>().mockResolvedValue(
      PLANNER_TYPES.map((type, index) => ({
        userId: '12',
        type,
        count: String(index + 1),
      })),
    );
    const getRepository = jest.fn().mockReturnValue({
      createQueryBuilder: jest.fn().mockReturnValue(planner),
    });
    const service = Object.create(UsersService.prototype) as UsersService;
    Object.assign(service, {
      usersRepository: {
        createQueryBuilder: jest.fn().mockReturnValue(list),
        manager: { getRepository },
      },
    });
    return { service, list, planner, getRepository };
  }

  it('returns seven independent creation counters and preserves diary/plan fields', async () => {
    const { service, planner, getRepository } = setup();
    const result = await service.getUsersWithStats({
      page: 2,
      limit: 2,
      sortBy: 'createdAt',
    });
    expect(result.users[0]).toMatchObject({
      id: 12,
      entriesStatsCount: 9,
      dialogsStatsCount: 8,
      checkinsStatsCount: 7,
      checkinDialogsStatsCount: 6,
      plan: { id: 3 },
      goalsStats: [{ id: 1 }, { id: 2 }],
      plannerCreatedCounts: {
        goal: 1,
        habit: 2,
        checklist: 3,
        task: 4,
        event: 5,
        reminder: 6,
        note: 7,
      },
    });
    expect(result.users[1].plannerCreatedCounts).toEqual(
      Object.fromEntries(PLANNER_TYPES.map((type) => [type, 0])),
    );
    expect(getRepository).toHaveBeenCalledWith(PlannerCreationStat);
    // Count actual Create evidence, including deleted creations, excluding null
    // timestamps (technical branches and deletion-before-create tombstones).
    expect(planner.addSelect).toHaveBeenCalledWith(
      'COUNT(pcs.createdAt)',
      'count',
    );
    expect(planner.where).toHaveBeenCalledTimes(1);
    expect(planner.where).toHaveBeenCalledWith('pcs.userId IN (:...userIds)', {
      userIds: [12, 13],
    });
    expect(result).toMatchObject({ total: 2, page: 2, pageCount: 1, limit: 2 });
  });

  it('does not query planner statistics for an empty page', async () => {
    const { service, getRepository } = setup(true);
    expect((await service.getUsersWithStats({})).users).toEqual([]);
    expect(getRepository).not.toHaveBeenCalled();
  });

  it('V2 uses counters and compact fields instead of joined activity/payment arrays', async () => {
    const { service, list } = setup();
    await service.getUsersWithStats({
      compact: true,
      sortBy: 'createdAt',
      registrationRange: { from: '2026-10-13', to: '2026-10-22' },
    });
    expect(list.leftJoinAndSelect).not.toHaveBeenCalledWith(
      'u.payments',
      expect.anything(),
    );
    expect(list.leftJoinAndSelect).not.toHaveBeenCalledWith(
      'u.goalsStats',
      expect.anything(),
    );
    expect(list.leftJoinAndSelect).not.toHaveBeenCalledWith(
      'u.settings',
      expect.anything(),
    );
    expect(list.loadRelationCountAndMap).toHaveBeenCalledWith(
      'u.goalsStatsCount',
      'u.goalsStats',
    );
    expect(list.select).toHaveBeenCalledWith(
      expect.arrayContaining(['u.id', 'u.createdAt', 'u.acquisitionSource']),
    );
    expect(list.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('u.createdAt <'),
      expect.objectContaining({
        from: '2026-10-13',
        to: '2026-10-22',
        zone: 'Europe/Kyiv',
      }),
    );
    expect(list.addOrderBy).toHaveBeenCalledWith('u.id', 'DESC');
  });
});
