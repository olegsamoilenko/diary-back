import { describe, expect, it } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { UsersService } from './users.service';
import { returningUsersForDaySql } from './admin-returning-users';

const container = process.env.ADMIN_GROWTH_POSTGRES_CONTAINER;
(container ? describe : describe.skip)(
  'Daily returning users in PostgreSQL',
  () => {
    const now = Date.now();
    const dateAgo = (days: number) =>
      new Date(now - days * 86400000).toISOString().slice(0, 10);
    const from = dateAgo(4);
    const to = dateAgo(2);
    const fixtures = `users(id, uuid, "createdAt") AS (
      SELECT i, 'user-' || i,
        ((CASE WHEN i = 4 THEN $1::date ELSE $1::date - 1 END)::timestamp
           AT TIME ZONE $3) AT TIME ZONE 'UTC'
      FROM generate_series(1, 9) i
    ), logs AS (
      SELECT ($1::date::timestamp AT TIME ZONE $3) + minutes * interval '1 minute' AS ts,
        id AS "userId", uuid AS "userUuid", 'frontend' AS source, 'info' AS level,
        CASE WHEN id = 1 THEN build || '-session' END AS "sessionId",
        jsonb_build_object('appBuild', build) AS "appData", name,
        CASE WHEN name = 'request_success' THEN 'perf' ELSE 'app' END AS kind,
        jsonb_build_object('method', 'POST', 'url', url, 'state', 'active',
          '_origin', jsonb_build_object('component', '_Layout')) AS data
      FROM (VALUES
        (1, NULL, '284', 'request_success', '/users/me', 1),
        (1, NULL, '284', 'request_success', '/subscriptions/bootstrap', 2),
        (1, NULL, '289', 'app_start', NULL, 3),
        (1, NULL, '289', 'app_start', NULL, 40),
        (1, NULL, '289', 'app_start', NULL, 40),
        (NULL, 'user-2', '284', 'request_success', '/users/me', 4),
        (NULL, 'user-2', '284', 'request_success', '/subscriptions/bootstrap', 12),
        (3, NULL, '289', 'app_start', NULL, 5),
        (4, NULL, '289', 'app_start', NULL, 6),
        (4, NULL, '290', 'app_start', NULL, 1500),
        (5, NULL, '284', 'app_start', NULL, 7),
        (5, NULL, '284', 'app_state_change', NULL, 8),
        (6, NULL, '289', 'request_success', '/users/me', 9),
        (6, NULL, '284', 'request_success', '/other', 10),
        (7, NULL, NULL, 'app_start', NULL, 11),
        (8, NULL, 'unknown', 'app_start', NULL, 12),
        (9, NULL, '283', 'app_start', NULL, 13)
      ) v(id, uuid, build, name, url, minutes)
    ), diary_events AS (
      SELECT id, type, has_ai_analysis,
             (($1::date::timestamp AT TIME ZONE $3) + minutes * interval '1 minute') AT TIME ZONE 'UTC' AS at
      FROM (VALUES
        (1, 'entry', -1, true), (1, 'entry', 0, NULL),
        (1, 'entry', 2, false), (1, 'entry', 42, true), (1, 'entry', 1440, true),
        (4, 'entry', 15, true), (1, 'dialog', 3, NULL),
        (1, 'checkin', 4, NULL), (1, 'checkin', 45, true), (1, 'checkin', 47, false),
        (1, 'checkin_dialog', 48, NULL)
      ) v(id, type, minutes, has_ai_analysis)
    ), entries_stats(user_id, "createdAt", "hasAiAnalysis") AS (
      SELECT id, at, has_ai_analysis FROM diary_events WHERE type = 'entry'
    ), dialogs_stats("userId", "createdAt") AS (
      SELECT id, at FROM diary_events WHERE type = 'dialog'
    ), checkins_stats(user_id, "createdAt", "hasAiAnalysis") AS (
      SELECT id, at, has_ai_analysis FROM diary_events WHERE type = 'checkin'
    ), checkin_dialogs_stats(user_id, "createdAt") AS (
      SELECT id, at FROM diary_events WHERE type = 'checkin_dialog'
    ), planner_creation_stats(user_id, type, created_at) AS (
      SELECT 1, 'task', ($1::date::timestamp AT TIME ZONE $3) + interval '50 minutes'
    ),`;

    function queryPostgres(sql: string, params: (string | number)[]) {
      const query = sql.replace(/^WITH /, `WITH ${fixtures} `);
      const args = params
        .map((param) =>
          typeof param === 'string' ? `'${param}'` : String(param),
        )
        .join(', ');
      const output = execFileSync(
        'docker',
        [
          'exec',
          '-i',
          container!,
          'sh',
          '-c',
          'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -Atq',
        ],
        {
          input: `BEGIN READ ONLY;
            PREPARE metric AS SELECT json_agg(t) FROM (${query}) t;
            EXECUTE metric(${args}); ROLLBACK;`,
          encoding: 'utf8',
          timeout: 30000,
        },
      );
      return JSON.parse(output.trim()) as unknown;
    }

    it('uses the signal for each build and deduplicates across an upgrade on the same Kyiv day', async () => {
      const service = Object.create(UsersService.prototype) as UsersService;
      Object.assign(service, {
        usersRepository: {
          query(sql: string, params: string[]) {
            expect(params).toEqual([from, to, 'Europe/Kyiv']);
            return queryPostgres(sql, params);
          },
        },
      });
      const { days } = await service.getAdminReturningUsersDays(from, to);
      expect(days).toEqual([
        { date: to, count: 0, legacy284Count: 0, appStartCount: 0 },
        { date: dateAgo(3), count: 1, legacy284Count: 0, appStartCount: 1 },
        { date: from, count: 3, legacy284Count: 2, appStartCount: 2 },
      ]);
    });

    it('shows repeated opens with the right actions, preserving cohort totals and sorting across pages', async () => {
      const service = Object.create(UsersService.prototype) as UsersService;
      Object.assign(service, {
        usersRepository: { query: queryPostgres },
        async getUsersWithStats({ userIds }: { userIds: number[] }) {
          return { users: [...userIds].reverse().map((id) => ({ id })) };
        },
      });
      const chronological = await service.getAdminReturningUsersForDay(from);
      expect(chronological.total).toBe(3);
      expect(chronological.totalVisits).toBe(5);
      expect(chronological.hasUnidentifiedLegacyVisits).toBe(true);
      expect(chronological.users.map(({ id }) => id)).toEqual([3, 2, 1]);
      expect(chronological.users[0]).toMatchObject({
        counts: {},
        eventCount: 0,
        dayAnalysis: {
          entries: { withAnalysis: 0, withoutAnalysis: 0, unknown: 0 },
          checkins: { withAnalysis: 0, withoutAnalysis: 0, unknown: 0 },
        },
      });

      const byEvents = await service.getAdminReturningUsersForDay(
        from,
        'events',
      );
      expect(byEvents.users.map(({ id }) => id)).toEqual([1, 3, 2]);
      const [user] = byEvents.users;
      expect(user.eventCount).toBe(9);
      expect(user.counts).toEqual({
        entries: 3,
        dialogs: 1,
        checkins: 3,
        checkinDialogs: 1,
        task: 1,
      });
      expect(user.dayAnalysis).toEqual({
        entries: { withAnalysis: 1, withoutAnalysis: 1, unknown: 1 },
        checkins: { withAnalysis: 1, withoutAnalysis: 1, unknown: 1 },
      });
      expect(user.actionsBeforeFirstVisit).toMatchObject([
        { type: 'entries', hasAiAnalysis: null },
      ]);
      expect(
        user.visits.map(({ actions }: { actions: { type: string }[] }) =>
          actions.map(({ type }) => type),
        ),
      ).toEqual([
        ['entries'],
        ['dialogs', 'checkins'],
        ['entries', 'checkins', 'checkins', 'checkinDialogs', 'task'],
      ]);
      expect(user.visits).toMatchObject([
        { actions: [{ type: 'entries', hasAiAnalysis: false }] },
        {
          actions: [
            { type: 'dialogs' },
            { type: 'checkins', hasAiAnalysis: null },
          ],
        },
        {
          actions: [
            { type: 'entries', hasAiAnalysis: true },
            { type: 'checkins', hasAiAnalysis: true },
            { type: 'checkins', hasAiAnalysis: false },
            { type: 'checkinDialogs' },
            { type: 'task' },
          ],
        },
      ]);
      expect(
        Date.parse(user.visits[1].openedAt) - Date.parse(user.firstVisitAt),
      ).toBe(120000);
      expect(
        queryPostgres(returningUsersForDaySql('events'), [
          from,
          from,
          'Europe/Kyiv',
          1,
          1,
        ]),
      ).toMatchObject([{ total: 3, totalVisits: 5, rows: [{ id: 3 }] }]);
      const emptyPage = await service.getAdminReturningUsersForDay(
        from,
        'events',
        '2',
      );
      expect(emptyPage).toMatchObject({ total: 3, totalVisits: 5, users: [] });
    });
  },
);
