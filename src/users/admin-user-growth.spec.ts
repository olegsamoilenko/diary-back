import { describe, expect, it, jest } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import {
  buildAdminUserGrowthQuery,
  getAdminUserGrowth,
} from './admin-user-growth';

describe('Admin user growth contract', () => {
  it.each(['day', 'week', 'month', 'quarter', 'year'])(
    'accepts %s and includes both AdFree plans',
    (group) => {
      const { parameters } = buildAdminUserGrowthQuery(
        '2026-10-01',
        '2026-10-28',
        group,
      );
      expect(parameters[2]).toBe(group);
      expect(parameters[5]).toEqual(
        expect.arrayContaining([
          'ad-free-m1',
          'ad-free-y1',
          'lite-m1',
          'base-m1',
          'pro-m1',
        ]),
      );
    },
  );
  it.each([
    ['2026-02-30', '2026-03-01', 'day'],
    ['2026-10-28', '2026-10-01', 'day'],
    ['2026-10-01', '2026-10-28', 'all'],
    ['2026-10-01', '2026-10-28', '__proto__'],
    ['2000-01-01', '2026-10-28', 'day'],
  ])('rejects invalid or excessive range %s %s %s', (from, to, group) => {
    expect(() => buildAdminUserGrowthQuery(from, to, group)).toThrow();
  });
  it('returns numeric totals without hydrating users', async () => {
    const points = [
      {
        date: '2026-10-01',
        from: '2026-10-01',
        to: '2026-10-01',
        newUsers: 4,
        newPaidUsers: 2,
        paidByPlan: { 'base-m1': 2 },
      },
    ];
    const query = jest
      .fn<() => Promise<typeof points>>()
      .mockResolvedValue(points);
    const result = await getAdminUserGrowth(
      { query } as any,
      '2026-10-01',
      '2026-10-01',
      'day',
    );
    expect(query).toHaveBeenCalledTimes(1);
    expect(result.totals).toEqual({ newUsers: 4, newPaidUsers: 2 });
    expect(result.timezone).toBe('Europe/Kyiv');
    expect(result.points[0].paidByPlan).toEqual({
      'ad-free-m1': 0,
      'ad-free-y1': 0,
      'lite-m1': 0,
      'base-m1': 2,
      'pro-m1': 0,
    });
  });
});

// Optional real PostgreSQL check. CTEs shadow application tables; no data is written.
// ADMIN_GROWTH_POSTGRES_CONTAINER=nemory-postgres npx jest --runInBand --runTestsByPath src/users/admin-user-growth.spec.ts
const container = process.env.ADMIN_GROWTH_POSTGRES_CONTAINER;
const postgresDescribe = container ? describe : describe.skip;
postgresDescribe(
  'Admin growth PostgreSQL semantics (read-only fixtures)',
  () => {
    const fixtures = `users AS (
    SELECT id, CASE id
      WHEN 1 THEN '2026-10-23 21:00'::timestamp
      WHEN 2 THEN '2026-10-25 21:59'::timestamp
      WHEN 3 THEN '2026-10-25 22:00'::timestamp
      WHEN 4 THEN '2026-10-26 22:00'::timestamp
      ELSE '2026-09-01'::timestamp END AS "createdAt"
    FROM generate_series(1, 12) id
  ), store_subscriptions("userId", "basePlanId", "lastOrderId", "startTime") AS (VALUES
    (1, 'ad-free-m1', 'order-1', '2026-10-23 21:00Z'::timestamptz),
    (2, 'ad-free-y1', 'order-2', '2026-10-25 22:00Z'::timestamptz),
    (3, 'lite-m1', 'renewal-3', '2026-10-24 12:00Z'::timestamptz),
    (5, 'base-m1', 'order-5', '2026-10-24 12:00Z'::timestamptz),
    (6, 'pro-m1', 'expired-order', '2026-10-25 12:00Z'::timestamptz),
    (7, 'lite-m1', NULL, '2026-10-25 12:00Z'::timestamptz),
    (8, 'testing', 'test-order', '2026-10-25 12:00Z'::timestamptz),
    (9, 'start-d7', 'trial-order', '2026-10-25 12:00Z'::timestamptz),
    (10, 'base-m1', 'future-order', '2026-10-26 22:00Z'::timestamptz),
    (11, 'lite-m1', 'new-lite-order', '2026-10-25 12:00Z'::timestamptz),
    (999, 'base-m1', 'deleted-user', '2026-10-25 12:00Z'::timestamptz),
    (12, 'base-m1', '', '2026-10-25 12:00Z'::timestamptz)
  ), plans("userId", "basePlanId", "lastOrderId", "startTime") AS (VALUES
    (3, 'ad-free-m1', 'old-order', '2026-09-01 12:00Z'::timestamptz),
    (5, 'base-m1', 'order-5', '2026-10-24 12:00Z'::timestamptz),
    (5, 'pro-m1', 'upgrade-5', '2026-10-25 12:00Z'::timestamptz),
    (8, 'ad-free-y1', 'legacy-order', '2026-10-25 12:00Z'::timestamptz)
  ),`;

    function read(group: string, from = '2026-10-24', to = '2026-10-26') {
      const { sql, parameters } = buildAdminUserGrowthQuery(from, to, group);
      const literal = (value: unknown): string =>
        Array.isArray(value)
          ? `ARRAY[${value.map(literal).join(',')}]`
          : `'${String(value).replace(/'/g, "''")}'`;
      const statement = sql.replace(/^WITH/, `WITH ${fixtures}`);
      const input = `BEGIN READ ONLY; PREPARE growth AS SELECT json_agg(row_to_json(t)) FROM (${statement}) t; EXECUTE growth(${parameters.map(literal).join(',')}); ROLLBACK;`;
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
        { input, encoding: 'utf8', timeout: 30000 },
      );
      return JSON.parse(output.trim()) as {
        date: string;
        from: string;
        to: string;
        newUsers: number;
        newPaidUsers: number;
        paidByPlan: Record<string, number>;
      }[];
    }

    it('handles Kyiv midnight and DST; deduplicates renewals, migrations and upgrades before date filtering', () => {
      expect(read('day')).toEqual([
        {
          date: '2026-10-24',
          from: '2026-10-24',
          to: '2026-10-24',
          newUsers: 1,
          newPaidUsers: 2,
          paidByPlan: { 'ad-free-m1': 1, 'base-m1': 1 },
        },
        {
          date: '2026-10-25',
          from: '2026-10-25',
          to: '2026-10-25',
          newUsers: 1,
          newPaidUsers: 3,
          paidByPlan: { 'ad-free-y1': 1, 'pro-m1': 1, 'lite-m1': 1 },
        },
        {
          date: '2026-10-26',
          from: '2026-10-26',
          to: '2026-10-26',
          newUsers: 1,
          newPaidUsers: 1,
          paidByPlan: { 'ad-free-y1': 1 },
        },
      ]);
    });
    it.each(['week', 'month', 'quarter', 'year'])(
      'preserves totals and clips partial %s buckets',
      (group) => {
        const points = read(group);
        expect(points.reduce((sum, p) => sum + p.newUsers, 0)).toBe(3);
        expect(points.reduce((sum, p) => sum + p.newPaidUsers, 0)).toBe(6);
        for (const point of points)
          expect(
            Object.values(point.paidByPlan).reduce(
              (sum, count) => sum + count,
              0,
            ),
          ).toBe(point.newPaidUsers);
        expect(points[0].from).toBe('2026-10-24');
        expect(points.at(-1)?.to).toBe('2026-10-26');
        if (group === 'week')
          expect(points.map((p) => p.date)).toEqual([
            '2026-10-19',
            '2026-10-26',
          ]);
      },
    );
    it('fills empty calendar buckets with zeros', () => {
      expect(read('day', '2026-10-20', '2026-10-22')).toHaveLength(3);
      expect(
        read('year', '2024-01-01', '2025-12-31').map((p) => [
          p.newUsers,
          p.newPaidUsers,
        ]),
      ).toEqual([
        [0, 0],
        [0, 0],
      ]);
    });
  },
);
