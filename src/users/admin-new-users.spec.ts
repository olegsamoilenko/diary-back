import {
  DataSource,
  SelectQueryBuilder,
  getMetadataArgsStorage,
} from 'typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import {
  positiveInteger,
  registrationRange,
  publicAdminData,
} from './admin-user-statistics';

describe('Admin V2 registration statistics', () => {
  let source: DataSource;
  let service: UsersService;
  beforeAll(async () => {
    source = new DataSource({
      type: 'postgres',
      entities: getMetadataArgsStorage()
        .tables.map((table) => table.target)
        .filter((target) => typeof target === 'function'),
    });
    // Build real entity metadata and SQL, without connecting to any database.
    await (source as any).buildMetadatas();
    service = Object.create(UsersService.prototype) as UsersService;
    Object.assign(service, { usersRepository: source.getRepository(User) });
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('aggregates the complete cohort without joins or pagination, and fills empty dates', async () => {
    let sql = '';
    let parameters: unknown[] = [];
    jest
      .spyOn(SelectQueryBuilder.prototype, 'getRawMany')
      .mockImplementation(async function (this: SelectQueryBuilder<User>) {
        [sql, parameters] = this.getQueryAndParameters();
        return [{ date: '2026-10-25', total: '4', withAction: '3' }];
      });
    const result = await service.getAdminNewUsersDays(
      '2026-10-24',
      '2026-10-26',
    );
    expect(result.days).toEqual([
      { date: '2026-10-24', total: 0, withAction: 0, withoutAction: 0 },
      { date: '2026-10-25', total: 4, withAction: 3, withoutAction: 1 },
      { date: '2026-10-26', total: 0, withAction: 0, withoutAction: 0 },
    ]);
    expect(sql).not.toMatch(/JOIN|LIMIT|OFFSET/);
    expect(sql.match(/EXISTS/g)).toHaveLength(6);
    expect(sql).toContain('"e0"."user_id" = "u"."id"');
    expect(sql).toContain('"e4"."userId" = "u"."id"');
    expect(sql).toContain('"e5"."created_at" IS NOT NULL');
    expect(sql).not.toContain('deleted_at');
    expect(sql).toContain('"u"."createdAt" >=');
    expect(sql).toContain('"u"."createdAt" <');
    expect(parameters).toEqual(
      expect.arrayContaining(['2026-10-24', '2026-10-26', 'Europe/Kyiv']),
    );
  });

  it('counts explicit true/false/null analysis states independently for each user and entity', async () => {
    let sql = '';
    jest
      .spyOn(SelectQueryBuilder.prototype, 'getRawAndEntities')
      .mockImplementation(async function (this: SelectQueryBuilder<User>) {
        sql = this.getQuery();
        return {
          entities: [{ id: 7 } as User],
          raw: [
            {
              u_id: 7,
              entries_stats_count: '15',
              checkins_stats_count: '6',
              entries_analysis: {
                withAnalysis: 5,
                withoutAnalysis: 5,
                unknown: 5,
              },
              checkins_analysis: {
                withAnalysis: 1,
                withoutAnalysis: 2,
                unknown: 3,
              },
            },
          ],
        };
      });
    jest.spyOn(SelectQueryBuilder.prototype, 'getCount').mockResolvedValue(1);
    jest
      .spyOn(SelectQueryBuilder.prototype, 'getRawMany')
      .mockResolvedValue([]);
    const result = await service.getUsersWithStats({ compact: true });
    expect(result.users[0]).toMatchObject({
      entriesStatsCount: 15,
      checkinsStatsCount: 6,
      entriesAnalysis: { withAnalysis: 5, withoutAnalysis: 5, unknown: 5 },
      checkinsAnalysis: { withAnalysis: 1, withoutAnalysis: 2, unknown: 3 },
    });
    for (const state of ['TRUE', 'FALSE', 'NULL']) {
      expect(
        sql.match(new RegExp('"s"\\."hasAiAnalysis" IS ' + state, 'g')),
      ).toHaveLength(2);
    }
    expect(sql.match(/"s"\."user_id" = "u"\."id"/g)).toHaveLength(2);
    expect(sql).not.toContain('inputTokens');
  });

  it('accepts arbitrary positive page sizes, defaults to 200 and keeps the date filter', async () => {
    const getStats = jest
      .spyOn(service, 'getUsersWithStats')
      .mockResolvedValue({
        users: [],
        total: 0,
        page: 1,
        pageCount: 1,
        limit: 200,
      });
    await service.getAdminNewUsers('2026-10-13', '2026-10-22');
    expect(getStats).toHaveBeenLastCalledWith(
      expect.objectContaining({
        limit: 200,
        page: 1,
        compact: true,
        sortBy: 'createdAt',
      }),
    );
    await service.getAdminNewUsers('2026-10-13', '2026-10-22', '3', '137');
    expect(getStats).toHaveBeenLastCalledWith(
      expect.objectContaining({
        limit: 137,
        page: 3,
        registrationRange: { from: '2026-10-13', to: '2026-10-22' },
      }),
    );
  });

  it.each(['0', '-2', '1.5', 'NaN', 'Infinity', ''])(
    'rejects invalid page size %s',
    (value) => {
      expect(() => positiveInteger(value, 200)).toThrow();
    },
  );
  it.each([
    ['2026-02-30', '2026-03-01'],
    ['2026-10-23', '2026-10-22'],
    ['2026-10-01T00:00:00Z', '2026-10-22'],
    ['', '2026-10-22'],
  ])('rejects invalid range %s to %s', (from, to) => {
    expect(() => registrationRange(from, to)).toThrow();
  });
  it('accepts same-day and leap-day periods', () => {
    expect(registrationRange('2024-02-29', '2024-02-29')).toEqual({
      from: '2024-02-29',
      to: '2024-02-29',
    });
  });
  it('keeps profile/statistics while removing authentication and encryption material', () => {
    expect(
      publicAdminData({
        id: 12,
        hash: 'private',
        password: 'private',
        dekEncrypted: Buffer.from('private'),
        entriesStatsCount: 3,
        plan: { name: 'Plus', purchaseToken: 'private' },
      }),
    ).toEqual({ id: 12, entriesStatsCount: 3, plan: { name: 'Plus' } });
  });

  it('loads the existing purchased-credit wallet only in expanded details without modifying it', async () => {
    const detailsService = Object.create(
      UsersService.prototype,
    ) as UsersService;
    const summary = {
      total: 1200,
      used: 300,
      remaining: 900,
      debt: 0,
      revoked: 0,
    };
    const getSummary = jest
      .fn<() => Promise<typeof summary>>()
      .mockResolvedValue(summary);
    const findOne = jest
      .fn<() => Promise<any>>()
      .mockResolvedValue({ payments: [{ id: 4, purchaseToken: 'private' }] });
    Object.assign(detailsService, {
      usersRepository: { findOne },
      creditWalletService: { getSummary },
    });
    jest.spyOn(detailsService, 'getUsersWithStats').mockResolvedValue({
      users: [{ id: 12, plan: null }],
      page: 1,
      pageCount: 1,
      total: 1,
      limit: 1,
    });
    expect(await detailsService.getAdminUserDetails('12')).toEqual({
      id: 12,
      plan: null,
      payments: [{ id: 4 }],
      purchasedCredits: summary,
    });
    expect(getSummary).toHaveBeenCalledWith(12);
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 12 },
        relationLoadStrategy: 'query',
      }),
    );
  });
});
import {
  describe,
  it,
  expect,
  jest,
  beforeAll,
  afterEach,
} from '@jest/globals';
