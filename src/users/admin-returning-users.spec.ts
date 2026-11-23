import { describe, expect, it } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { UsersService } from './users.service';

const container = process.env.ADMIN_GROWTH_POSTGRES_CONTAINER;
(container ? describe : describe.skip)(
  'Daily returning users in PostgreSQL',
  () => {
    it('uses the signal for each build and deduplicates across an upgrade on the same Kyiv day', async () => {
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
        jsonb_build_object('appBuild', build) AS "appData", name,
        CASE WHEN name = 'request_success' THEN 'perf' ELSE 'app' END AS kind,
        jsonb_build_object('method', 'POST', 'url', url, 'state', 'active',
          '_origin', jsonb_build_object('component', '_Layout')) AS data
      FROM (VALUES
        (1, NULL, '284', 'request_success', '/users/me', 1),
        (1, NULL, '284', 'request_success', '/subscriptions/bootstrap', 2),
        (1, NULL, '289', 'app_start', NULL, 3),
        (NULL, 'user-2', '284', 'request_success', '/users/me', 4),
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
    ),`;
      const service = Object.create(UsersService.prototype) as UsersService;
      Object.assign(service, {
        usersRepository: {
          query(sql: string, params: string[]) {
            expect(params).toEqual([from, to, 'Europe/Kyiv']);
            const query = sql.replace(/^WITH /, `WITH ${fixtures} `);
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
              EXECUTE metric('${from}', '${to}', 'Europe/Kyiv'); ROLLBACK;`,
                encoding: 'utf8',
                timeout: 30000,
              },
            );
            return JSON.parse(output.trim()) as unknown;
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
  },
);
