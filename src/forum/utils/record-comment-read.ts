import { EntityManager } from 'typeorm';
import { ForumTopicReadState } from '../entities/forum-topic-read-state.entity';
import { ForumContentStatus } from '../types/forum-content-status.enum';

// A single topic-state row serializes reads from concurrent visibility callbacks/devices.
// Keep only out-of-order reads; compact the rest into the existing timestamp watermark.
// Timestamp comparison stays in PostgreSQL so sub-millisecond comment order is preserved.
export const COMPACT_COMMENT_READ_SQL = `
WITH state AS (
  SELECT * FROM forum_topic_read_states WHERE id = $1
), seen AS (
  SELECT DISTINCT unnest(array_append(individually_read_comment_ids, $2::uuid)) AS id FROM state
), first_unread AS (
  SELECT min(c.created_at) AS at FROM forum_comments c, state s
  WHERE c.topic_id = s.topic_id AND c.author_id != s.user_id
    AND c.status = $3 AND c.deleted_at IS NULL AND c.created_at > s.last_read_at
    AND c.id NOT IN (SELECT id FROM seen)
), watermark AS (
  SELECT greatest(s.last_read_at, coalesce((
    SELECT max(c.created_at) FROM forum_comments c JOIN seen ON seen.id = c.id
    WHERE c.topic_id = s.topic_id
      AND c.created_at < coalesce((SELECT at FROM first_unread), 'infinity'::timestamptz)
  ), s.last_read_at)) AS at FROM state s
), saved AS (
UPDATE forum_topic_read_states s SET
  last_read_at = w.at,
  last_read_comment_id = coalesce((
    SELECT c.id FROM forum_comments c JOIN seen ON seen.id = c.id
    WHERE c.topic_id = s.topic_id AND c.created_at = w.at ORDER BY c.id DESC LIMIT 1
  ), s.last_read_comment_id),
  individually_read_comment_ids = ARRAY(
    SELECT c.id FROM forum_comments c JOIN seen ON seen.id = c.id
    WHERE c.topic_id = s.topic_id AND c.created_at > w.at
      AND c.status = $3 AND c.deleted_at IS NULL
  ),
  updated_at = now()
FROM watermark w WHERE s.id = $1
RETURNING s.last_read_at AS "lastReadAt", s.last_read_comment_id AS "lastReadCommentId"
) SELECT * FROM saved
`;

export async function recordCommentRead(
  manager: EntityManager,
  params: {
    userId: number;
    topicId: string;
    topicCreatedAt: Date;
    commentId: string;
  },
) {
  const repo = manager.getRepository(ForumTopicReadState);
  await repo
    .createQueryBuilder()
    .insert()
    .values({
      userId: params.userId,
      topicId: params.topicId,
      firstViewedAt: new Date(),
      lastReadAt: params.topicCreatedAt,
    })
    .orIgnore()
    .execute();
  const state = await repo.findOneOrFail({
    where: { userId: params.userId, topicId: params.topicId },
    lock: { mode: 'pessimistic_write' },
  });
  const [result] = await manager.query(COMPACT_COMMENT_READ_SQL, [
    state.id,
    params.commentId,
    ForumContentStatus.PUBLISHED,
  ]);
  return result as { lastReadAt: Date; lastReadCommentId: string | null };
}
