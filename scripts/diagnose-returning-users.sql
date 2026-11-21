-- Read-only comparison for the last ten Kyiv dates. All outputs are daily aggregates.
WITH days AS (
  SELECT (now() AT TIME ZONE 'Europe/Kyiv')::date - n AS day
  FROM generate_series(0, 9) AS n
), evidence AS (
  SELECT (l.ts AT TIME ZONE 'Europe/Kyiv')::date AS day,
         CASE WHEN l.name = 'app_start' THEN 'start'
              WHEN l.name = 'app_state_change' THEN 'foreground'
              ELSE 'boot_request' END AS kind,
         u.id, ((u."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Kyiv')::date AS registered
  FROM logs l
  LEFT JOIN users u ON u.id = l."userId" OR (l."userId" IS NULL AND u.uuid = l."userUuid")
  WHERE l.ts >= ((SELECT min(day) FROM days)::timestamp AT TIME ZONE 'Europe/Kyiv')
    AND l.ts <= now() AND l.source = 'frontend'
    AND ((l.kind = 'app' AND (l.name = 'app_start'
           OR (l.name = 'app_state_change' AND l.data->>'state' = 'active')))
      OR (l.kind = 'perf' AND l.name = 'request_success' AND l.data->>'method' = 'POST'
           AND l.data->>'url' IN ('/users/me', '/subscriptions/bootstrap')
           AND l.data #>> '{_origin,component}' = '_Layout'))
), daily AS (
  SELECT day,
         count(*) FILTER (WHERE kind = 'start' AND id IS NULL) AS unmatched_start_events,
         count(DISTINCT id) FILTER (WHERE registered < day AND kind = 'start') AS original_chart,
         count(DISTINCT id) FILTER (WHERE registered < day AND kind = 'foreground') AS foreground_users,
         count(DISTINCT id) FILTER (WHERE registered < day AND kind = 'boot_request') AS boot_request_users,
         count(DISTINCT id) FILTER (WHERE registered < day) AS combined_users
  FROM evidence GROUP BY day
), server_activity AS (
  -- Independent comparison: the stored day also covers writes such as entries and comments.
  SELECT s.day, count(DISTINCT s.user_id) AS users
  FROM user_activity_stats s JOIN users u ON u.id = s.user_id
  WHERE s.day BETWEEN (SELECT min(day) FROM days) AND (SELECT max(day) FROM days)
    AND ((u."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Kyiv')::date < s.day
  GROUP BY s.day
)
SELECT d.day, coalesce(a.original_chart, 0) AS original_chart,
       coalesce(a.unmatched_start_events, 0) AS unmatched_start_events,
       coalesce(a.foreground_users, 0) AS foreground_users,
       coalesce(a.boot_request_users, 0) AS boot_request_users,
       coalesce(a.combined_users, 0) AS combined_users,
       coalesce(s.users, 0) AS server_activity_users
FROM days d LEFT JOIN daily a USING (day) LEFT JOIN server_activity s USING (day)
ORDER BY d.day DESC;
