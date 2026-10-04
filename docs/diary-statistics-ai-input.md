# AI input in creation statistics

Approved 23 September 2026: record input tokens and input credits for entries,
dialogs, check-ins and check-in dialogs. Include media sent to the model for
analysis. Exclude the model's output and separately generated images.

## Stored fields

`entries_stats`, `dialogs_stats`, `checkins_stats`, `checkin_dialogs_stats` inherit:

- `entryId`: nullable local source entry/check-in ID. The source event and all
  its dialog events carry the same ID. Group by authenticated owner AND entryId,
  never by entryId alone. All four tables have an owner/source composite index.
- `inputTokens`: observed provider input, including standard input, cache reads,
  cache writes, images/video frames and text/transcriptions in the prompt.
- `inputCredits`: the corresponding input charge already stored in
  `token_usage_history`; cache discounts, long-context rates and rounding are
  preserved. Never recomputed from a client estimate.
- `aiTraceId`: technical correlation with the existing AI `timingTraceId`.
  This extra field is necessary because a creation event and its AI usage arrive
  independently. No journal content or media is copied into statistics.

Historical rows and older clients have null metrics. Pending/unobserved usage
also remains null; null is not a free request. New explicitly AI-free check-ins
have zero metrics. An observed zero-token response also records zero.

Only the source response operation is included: `generate_entry_response`,
`generate_dialog_response`, `generate_checkin_response`, or
`generate_checkin_dialog_response`. Multiple observed attempts with the same
owner, trace and operation are summed. Output, embeddings, separate memory
extraction/repair, audio-transcription preparation charges and `generate_image`
are excluded. Text transcribed from audio still counts when sent in the model's
input. These fields measure the model input, not the entire workflow cost.

## Lifecycle and compatibility

The existing authenticated `POST /diary-statistics/add-*-stat` endpoints accept
optional `entryId`, `aiTraceId`, `aiRequested` and the existing `checkinName`. Clients do not
submit token or credit numbers. Empty legacy bodies remain valid.

`createDiaryStat` saves the creation event and reads any already committed usage.
After `TokensService.addTokenUserHistory` saves usage, `refreshDiaryStatAiInput`
updates any existing matching event. Both statistics operations use the same
PostgreSQL transaction advisory lock for the owner/trace to avoid losing a late
update. Token history is committed before its statistics update. Repeated
creation requests with a trace return the same event and do not increment the
existing activity counters again. Calls without a trace retain legacy behavior.

Owner and exact operation filters prevent cross-user/cross-operation matching.
Statistics failures are logged and cannot fail the response or alter billing.
No alternate tariff, billing flow, socket event or plan-access rule is added.
Existing aggregate count endpoints remain unchanged.

Source IDs refer to device-local entries, not a server diary-content table or the
numeric statistics row ID. There is deliberately no foreign key to a creation
statistics row: dialog events can arrive first, and old/offline creation events
may be absent. A replay with the same owner/trace can fill a missing entryId but
cannot reassign an existing link. Old rows remain null; there is no inferred
historical backfill. Sum source and dialog input metrics by owner/source for
cumulative input cost; the latest call's inputTokens describes context size.
No new aggregation endpoint is introduced in this change.

Frontend callers send their existing cycle IDs from entry creation/retry,
structured check-in creation and both dialog services. The shared viewer uses
the persisted entry kind to select entry-dialog versus check-in-dialog stats.
Image/daily check-ins currently created without AI explicitly send
`aiRequested: false`. Existing creation-event emission points remain unchanged.
All these callers now also send the saved source entryId, including entry AI
retries, structured/daily/image check-ins and both check-in dialog opening flows.

## Schema rollout

The current `AppModule` has `synchronize: true`, including production. After
deploying the updated backend, its usual startup creates the nullable columns
and indexes automatically. This change does not toggle that configuration.

`1790208000000-AddDiaryStatAiInput` provides the same schema change for deployments
using migrations instead. Its up path is safe after synchronization and leaves
old values null. The token-history owner/trace/operation index supports the
lookups. No production schema operation or deployment was run for this task.
Ship the backend before the updated client; old clients remain supported but
cannot populate exact input metrics without the correlation ID.

`1790208001000-AddDiaryStatEntryId` adds nullable source IDs and owner/source
indexes, also safe after synchronization. Existing table conventions are retained:
dialogs_stats uses userId; the other three tables use user_id. Updated backend
startup with synchronize adds these fields; no production database action was run.

## Verification

49 backend tests cover statistics arrival order, replay, owner/operation
isolation, actual versus estimated usage, cached pricing, billing error
isolation, nullable/idempotent migration and shared legacy/V2 response billing.
78 frontend tests cover creation, check-in/dialog routing and metadata transport.
TypeScript and scoped lint checks are also run. Tests use synthetic inputs and
mocks; no paid provider call or live production database mutation was performed.

Usage ledger for this task: fresh input, cached input and output token counters
were unavailable; no API-equivalent cost or account quota estimate is asserted.

Source-link follow-up: 14 backend tests pass (statistics and new migration),
86 frontend tests pass across API, entry/dialog, check-in dialog, structured and
image check-in suites, plus the focused daily check-in statistics test. The full
CreateCheckinProvider suite also has unrelated screen-close timing failures;
its relevant daily-save test passes in isolation. Both repositories pass
TypeScript and scoped source lint. No device data or production database was changed.
