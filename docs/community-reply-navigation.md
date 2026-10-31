# Community reply navigation — 2026-10-30

Personal replies reuse replyToCommentId, falling back to parentCommentId, scoped to the same topic. No extra reply-recipient storage or network request is introduced. The existing unread-session response adds unreadReplyCommentIds (ordered subset). Older clients ignore it; newer clients against an older server retain ordinary unread navigation.

Push keeps forum_new_comment and existing topicId/commentId deep-link fields. Only the actual recipient of the reply gets personalized text. Watch/mute preferences, author exclusion and per-device delivery are preserved. This is one notification path, not an additional send.

## Out-of-order reading

A timestamp alone cannot represent skipping earlier unread comments to read a personal reply. The existing forum_topic_read_states row therefore gains individually_read_comment_ids uuid[] (default empty). Individual reads lock that row in the current transaction, store sparse read IDs and compact only the contiguous read prefix into last_read_at. Comparisons run in PostgreSQL to retain timestamp microseconds. Explicit mark-all resets the array. This does not reconstruct comments already marked read before the change.

Migration: src/migrations/1793380000000-AddIndividualCommentReads.ts. Update backend/schema before releasing the frontend. Current AppModule has synchronize:true; installations using migrations instead must apply the migration before serving the new queries. No production migration/deployment was performed by this task.

## Validation

- 9 targeted Jest tests: direct/root/nested replies, self-reply, muted/unwatched recipients, generic fallback, four locales, ordered unread reply subset.
- Local PostgreSQL: test/forum-comment-reads.postgres.test.cjs, gated by NEMORY_TEST_LOCAL_POSTGRES=1 and a loopback DB host. Uses TEMP tables and ROLLBACK, never application rows. Exercises 60-comment gaps, repeated reads, timestamp ties and microseconds, compaction and explicit mark-all.
- Backend TypeScript check passed. Manual acceptance remains DEV-08-REPLIES in the frontend release checklist; automated validation is not phone or production acceptance.

No paid AI calls were made. Exact fresh/cached input and output usage counters are unavailable; no cost estimate is asserted.
