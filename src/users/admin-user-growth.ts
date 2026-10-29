import { BadRequestException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { User } from './entities/user.entity';
import { ADMIN_TIMEZONE, registrationRange } from './admin-user-statistics';
import { PAID_SUBSCRIPTION_BASE_PLAN_IDS } from '../subscriptions/subscription-catalog';

const intervals = {
  day: '1 day',
  week: '1 week',
  month: '1 month',
  quarter: '3 months',
  year: '1 year',
} as const;
export type GrowthGranularity = keyof typeof intervals;

export function buildAdminUserGrowthQuery(
  from: string,
  to: string,
  granularity: string,
) {
  registrationRange(from, to);
  if (!Object.prototype.hasOwnProperty.call(intervals, granularity)) {
    throw new BadRequestException(
      'Оберіть день, тиждень, місяць, квартал або рік.',
    );
  }
  // Bound the response even for a hand-crafted request. Coarser groups cover longer ranges.
  const days = (Date.parse(to) - Date.parse(from)) / 86400000;
  const approxDays = { day: 1, week: 7, month: 28, quarter: 84, year: 365 };
  if (days / approxDays[granularity as GrowthGranularity] > 2000) {
    throw new BadRequestException(
      'Завеликий період. Оберіть більший крок групування.',
    );
  }
  return {
    parameters: [
      from,
      to,
      granularity,
      intervals[granularity as GrowthGranularity],
      ADMIN_TIMEZONE,
      PAID_SUBSCRIPTION_BASE_PLAN_IDS,
    ],
    sql: `WITH
      buckets AS (
        SELECT generate_series(date_trunc($3, $1::date::timestamp),
          date_trunc($3, $2::date::timestamp), $4::interval) AS bucket
      ),
      registrations AS (
        SELECT date_trunc($3, "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE $5) AS bucket,
          COUNT(*)::int AS count
        FROM users
        WHERE "createdAt" >= ($1::date::timestamp AT TIME ZONE $5) AT TIME ZONE 'UTC'
          AND "createdAt" < (($2::date + 1)::timestamp AT TIME ZONE $5) AT TIME ZONE 'UTC'
        GROUP BY 1
      ),
      subscription_history AS (
        SELECT "userId", "startTime" AS started, "basePlanId", 0 AS priority FROM store_subscriptions
        WHERE "basePlanId" = ANY($6::text[]) AND NULLIF("lastOrderId", '') IS NOT NULL
          AND "startTime" IS NOT NULL
        UNION ALL
        SELECT "userId", "startTime" AS started, "basePlanId", 1 AS priority FROM plans
        WHERE "basePlanId" = ANY($6::text[]) AND NULLIF("lastOrderId", '') IS NOT NULL
      ),
      first_paid AS (
        -- Find the first subscription across ALL history before filtering the dates.
        -- Store startTime is the original start, not the renewal/ingestion timestamp.
        SELECT DISTINCT ON (h."userId") h."userId", h.started, h."basePlanId"
        FROM subscription_history h JOIN users u ON u.id = h."userId"
        ORDER BY h."userId", h.started, h.priority, h."basePlanId"
      ),
      paid_by_plan AS (
        SELECT date_trunc($3, started AT TIME ZONE $5) AS bucket, "basePlanId", COUNT(*)::int AS count
        FROM first_paid
        WHERE started >= $1::date::timestamp AT TIME ZONE $5
          AND started < ($2::date + 1)::timestamp AT TIME ZONE $5
        GROUP BY 1, 2
      ),
      paid AS (
        SELECT bucket, SUM(count)::int AS count,
          jsonb_object_agg("basePlanId", count) AS "paidByPlan"
        FROM paid_by_plan GROUP BY bucket
      )
      SELECT to_char(b.bucket, 'YYYY-MM-DD') AS date,
        to_char(GREATEST(b.bucket, $1::date), 'YYYY-MM-DD') AS "from",
        to_char(LEAST(b.bucket + $4::interval - interval '1 day', $2::date), 'YYYY-MM-DD') AS "to",
        COALESCE(r.count, 0)::int AS "newUsers", COALESCE(p.count, 0)::int AS "newPaidUsers",
        COALESCE(p."paidByPlan", '{}'::jsonb) AS "paidByPlan"
      FROM buckets b LEFT JOIN registrations r USING (bucket) LEFT JOIN paid p USING (bucket)
      ORDER BY b.bucket`,
  };
}

export async function getAdminUserGrowth(
  repository: Repository<User>,
  from: string,
  to: string,
  granularity: string,
) {
  const { sql, parameters } = buildAdminUserGrowthQuery(from, to, granularity);
  const points = await repository.query<
    {
      date: string;
      from: string;
      to: string;
      newUsers: number;
      newPaidUsers: number;
      paidByPlan: Record<string, number>;
    }[]
  >(sql, parameters);
  return {
    from,
    to,
    granularity,
    timezone: ADMIN_TIMEZONE,
    points: points.map((point) => ({
      ...point,
      paidByPlan: Object.fromEntries(
        PAID_SUBSCRIPTION_BASE_PLAN_IDS.map((id) => [
          id,
          point.paidByPlan[id] ?? 0,
        ]),
      ),
    })),
    totals: points.reduce(
      (total, point) => ({
        newUsers: total.newUsers + point.newUsers,
        newPaidUsers: total.newPaidUsers + point.newPaidUsers,
      }),
      { newUsers: 0, newPaidUsers: 0 },
    ),
  };
}
