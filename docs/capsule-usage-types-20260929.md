# Capsule usage labels — 29 September 2026

The current V2 flow previously stored source compression as `user_memory` and
response/dialog/day compression as `assistant_memory`. These were accounting
categories, not evidence of extra model calls beyond the capsule pipeline.

| Type | Existing operation / purpose |
| --- | --- |
| `entry_capsule` | Entry source digest and durable user facts in one extraction |
| `checkin_capsule` | AI-enabled check-in source digest and durable user facts |
| `entry_response_capsule` | Entry AI response insights, advice and commitments |
| `checkin_response_capsule` | Check-in AI response insights, advice and commitments |
| `dialog_capsule` | Question/answer capsule, including extracted memory and commitments |
| `daily_capsule` | Separate Luna day capsule for later weekly analysis |

The source extraction returns `userDigest` and `userMemory` together. The response
extraction returns `assistantMemory`, commitments/updates and exact reminders.
No new calls, new prompts, changed models, token limits or credit formulas were
introduced. Existing `operation`, `traceId`, legacy/V2 billing and response
contracts remain intact. Generic memory types remain for legacy extraction,
retrieval-index construction, durable-memory consolidation and commitment repair.
Routine morning/before-sleep check-ins still do not generate these capsules.

Changed: backend TokenType, actual AiService extraction call sites, day capsule
accounting, statistics buckets; matching admin types and existing charts. Missing
assistant sourceType keeps the existing entry default. The TypeORM media insert
argument is narrowed to omit the recursive User relation in its type only, to
avoid TS2589 after the enum expansion; runtime insertion is unchanged.

Migration `1790702400000-AddCapsuleTokenUsageTypes` preserves existing enum labels
and is idempotent. Historical day/dialog rows are classified by operation; source
and response rows require the same owner and an unambiguous matching response
trace. Unknown traces retain their original labels. The earlier uncommitted
periodic enum migration now preserves newer labels already added by development
synchronize so applying the migration chain cannot remove capsule values.

The new migration's up/backfill was applied directly to the configured development
database in a transaction, not through the full pending migration chain. A hash
over every non-type field in every history row was identical before and after.
Existing screenshot rows 3669/3672, the four dialog capsule rows and 3688 are
reclassified. Rows 3678/3681 retain generic labels because their independent
auto-generated traces do not identify a shared check-in cycle; no inference from
row order or timestamps was used. New check-in calls classify from sourceType.

Validation: seven capsule call-site tests, seven statistics bucket cases, 45
periodic-analysis cases (the changed day-type expectation was updated and rerun).
PostgreSQL fixture verified up, repeated up, down, same-trace owner isolation,
ambiguous trace preservation and unchanged non-type fields; its schema was rolled
back. Backend and admin TypeScript pass; scoped lint has zero errors (one existing
admin React hook dependency warning); diff check passes. No paid AI generation
was run. Future real model calls on the refreshed
backend remain the final live check.
