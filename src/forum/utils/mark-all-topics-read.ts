// One statement owns the cutoff and updates both read-state consumers atomically.
// Keep sparse reads on existing rows: they may include a concurrently read newer reply.
export const MARK_ALL_TOPICS_READ_SQL = `
WITH marked AS (
  INSERT INTO forum_topic_read_states
    (user_id, topic_id, first_viewed_at, last_read_at, last_read_comment_id)
  SELECT $1, t.id, statement_timestamp(), statement_timestamp(), t.last_comment_id
  FROM forum_topics t
  WHERE t.status = $2 AND t.deleted_at IS NULL
  ORDER BY t.id
  ON CONFLICT (user_id, topic_id) DO UPDATE SET
    first_viewed_at = COALESCE(forum_topic_read_states.first_viewed_at, EXCLUDED.first_viewed_at),
    last_read_at = GREATEST(forum_topic_read_states.last_read_at, EXCLUDED.last_read_at),
    last_read_comment_id = CASE
      WHEN forum_topic_read_states.last_read_at > EXCLUDED.last_read_at
      THEN forum_topic_read_states.last_read_comment_id ELSE EXCLUDED.last_read_comment_id END,
    updated_at = statement_timestamp()
  RETURNING topic_id, last_read_at
)
UPDATE forum_topic_watchers w
SET last_read_at = GREATEST(w.last_read_at, m.last_read_at)
FROM marked m WHERE w.user_id = $1 AND w.topic_id = m.topic_id
`;
