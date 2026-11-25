import { BadRequestException } from '@nestjs/common';
import { LOG_RETENTION_DAYS } from '../logs/log-retention';
import { ADMIN_TIMEZONE, registrationRange } from './admin-user-statistics';
import {
  PLANNER_TYPES,
  PlannerType,
} from '../planner-statistics/planner-statistics.dto';

export function validateReturningUsersRange(from: string, to: string) {
  registrationRange(from, to);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: ADMIN_TIMEZONE,
  }).format(new Date());
  const earliest = new Date(today + 'T00:00:00Z');
  earliest.setUTCDate(earliest.getUTCDate() - LOG_RETENTION_DAYS + 1);
  if (from < earliest.toISOString().slice(0, 10) || to > today) {
    throw new BadRequestException(
      `Оберіть дати за останні ${LOG_RETENTION_DAYS} календарних днів, включно із сьогодні.`,
    );
  }
}

// Both the chart and the drill-down use the same per-build visit attribution.
export const returningUserOpens = `opens AS (
  SELECT (l.ts AT TIME ZONE $3)::date AS day, u.id, l.name, l.ts AS opened_at,
         NULLIF(l."sessionId", '') AS session_id
  FROM logs l
  JOIN users u ON u.id = l."userId"
    OR (l."userId" IS NULL AND u.uuid = l."userUuid")
  WHERE l.source = 'frontend' AND l.level = 'info' AND (
    (l."appData"->>'appBuild' = '284'
      AND l.kind = 'perf' AND l.name = 'request_success'
      AND l.data->>'method' = 'POST'
      AND l.data->>'url' IN ('/users/me', '/subscriptions/bootstrap')
      AND l.data #>> '{_origin,component}' = '_Layout')
    OR (l.kind = 'app' AND l.name = 'app_start'
      AND CASE WHEN l."appData"->>'appBuild' ~ '^[1-9][0-9]{0,9}$'
               THEN (l."appData"->>'appBuild')::bigint END > 284)
  )
    AND l.ts >= ($1::date::timestamp AT TIME ZONE $3)
    AND l.ts < (($2::date + 1)::timestamp AT TIME ZONE $3)
    AND l.ts <= CURRENT_TIMESTAMP
    AND ((u."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE $3)::date
        < (l.ts AT TIME ZONE $3)::date
)`;

const diaryActions = [
  ['entries_stats', 'user_id', 'entries'],
  ['dialogs_stats', 'userId', 'dialogs'],
  ['checkins_stats', 'user_id', 'checkins'],
  ['checkin_dialogs_stats', 'user_id', 'checkinDialogs'],
] as const;

type DiaryAction = (typeof diaryActions)[number][2];
export type ReturningUserActionCounts = Partial<
  Record<DiaryAction | PlannerType, number>
>;
type ReturningUserAction = {
  type: DiaryAction | PlannerType;
  at: string;
  hasAiAnalysis: boolean | null;
};
export type ReturningUserActivityRow = {
  id: number;
  firstVisitAt: string;
  eventCount: number;
  counts: ReturningUserActionCounts;
  visitTimes: string[];
  actions: ReturningUserAction[];
};

export function groupReturningUserActions(row: ReturningUserActivityRow) {
  const { actions, visitTimes, ...activity } = row;
  const visits = visitTimes.map((openedAt) => ({
    openedAt,
    actions: [] as ReturningUserAction[],
  }));
  const actionsBeforeFirstVisit: ReturningUserAction[] = [];
  const dayAnalysis = {
    entries: { withAnalysis: 0, withoutAnalysis: 0, unknown: 0 },
    checkins: { withAnalysis: 0, withoutAnalysis: 0, unknown: 0 },
  };
  let visitIndex = -1;
  for (const action of actions) {
    if (action.type === 'entries' || action.type === 'checkins') {
      const counts = dayAnalysis[action.type];
      if (action.hasAiAnalysis === true) counts.withAnalysis += 1;
      else if (action.hasAiAnalysis === false) counts.withoutAnalysis += 1;
      else counts.unknown += 1;
    }
    const actionTime = Date.parse(action.at);
    while (
      visits[visitIndex + 1] &&
      Date.parse(visits[visitIndex + 1].openedAt) <= actionTime
    ) {
      visitIndex += 1;
    }
    (visits[visitIndex]?.actions ?? actionsBeforeFirstVisit).push(action);
  }
  return { ...activity, dayAnalysis, visits, actionsBeforeFirstVisit };
}

export function returningUsersForDaySql(sort: 'visit' | 'events') {
  const order =
    sort === 'events'
      ? '"eventCount" DESC, "firstVisitAt" DESC, id DESC'
      : '"firstVisitAt" DESC, id DESC';
  const dayStart = '($1::date::timestamp AT TIME ZONE $3)';
  const dayEnd = '(($2::date + 1)::timestamp AT TIME ZONE $3)';
  const diarySelect = diaryActions
    .map(
      ([table, owner, type]) => `
    SELECT s."${owner}" AS id, '${type}' AS type,
           s."createdAt" AT TIME ZONE 'UTC' AS occurred_at,
           ${type === 'entries' || type === 'checkins' ? 's."hasAiAnalysis"' : 'NULL::boolean'} AS has_ai_analysis
    FROM ${table} s JOIN visitors v ON v.id = s."${owner}"
    WHERE s."createdAt" >= (${dayStart} AT TIME ZONE 'UTC')
      AND s."createdAt" < (${dayEnd} AT TIME ZONE 'UTC')`,
    )
    .join(' UNION ALL ');
  const plannerTypes = PLANNER_TYPES.map((type) => `'${type}'`).join(', ');
  // 284 can emit multiple startup requests in one process session. Unidentified
  // legacy opens provide only a single fallback signal when no session is known.
  return `WITH ${returningUserOpens}, visit_events AS (
      SELECT id, MIN(opened_at) AS opened_at
      FROM opens
      WHERE name = 'request_success' AND session_id IS NOT NULL
      GROUP BY id, session_id
      UNION ALL
      SELECT o.id, MIN(o.opened_at)
      FROM opens o
      WHERE o.name = 'request_success' AND o.session_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM opens known
          WHERE known.id = o.id AND known.name = 'request_success'
            AND known.session_id IS NOT NULL
        )
      GROUP BY o.id
      UNION ALL
      SELECT DISTINCT id, opened_at FROM opens WHERE name = 'app_start'
    ), visitors AS (
      SELECT id, MIN(opened_at) AS "firstVisitAt", COUNT(*)::int AS "visitCount",
             json_agg(opened_at ORDER BY opened_at) AS "visitTimes"
      FROM visit_events GROUP BY id
    ), action_events AS (
      ${diarySelect}
      UNION ALL
      SELECT s.user_id AS id, s.type, s.created_at AS occurred_at, NULL::boolean
      FROM planner_creation_stats s JOIN visitors v ON v.id = s.user_id
      WHERE s.created_at >= ${dayStart} AND s.created_at < ${dayEnd}
        AND s.type IN (${plannerTypes})
    ), action_counts AS (
      SELECT id, type, COUNT(*)::int AS n FROM action_events GROUP BY id, type
    ), action_totals AS (
      SELECT id, SUM(a.n)::int AS "eventCount", jsonb_object_agg(a.type, a.n) AS counts
      FROM action_counts a GROUP BY id
    ), activity AS (
      SELECT v.*, COALESCE(a."eventCount", 0) AS "eventCount", COALESCE(a.counts, '{}'::jsonb) AS counts
      FROM visitors v LEFT JOIN action_totals a ON a.id = v.id
    ), selected AS (
      SELECT * FROM activity ORDER BY ${order} LIMIT $4 OFFSET $5
    ), selected_actions AS (
      SELECT a.id, json_agg(json_build_object('type', a.type, 'at', a.occurred_at,
                                             'hasAiAnalysis', a.has_ai_analysis)
                            ORDER BY a.occurred_at, a.type) AS actions
      FROM action_events a JOIN selected s ON s.id = a.id GROUP BY a.id
    ), detailed AS (
      SELECT s.*, COALESCE(a.actions, '[]'::json) AS actions
      FROM selected s LEFT JOIN selected_actions a ON a.id = s.id
    )
    SELECT (SELECT COUNT(*)::int FROM visitors) AS total,
           (SELECT COALESCE(SUM("visitCount"), 0)::int FROM visitors) AS "totalVisits",
           EXISTS (SELECT 1 FROM opens WHERE name = 'request_success' AND session_id IS NULL)
             AS "hasUnidentifiedLegacyVisits",
           COALESCE((SELECT json_agg(s ORDER BY ${order}) FROM detailed s), '[]'::json) AS rows`;
}
