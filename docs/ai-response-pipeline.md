## Play 284 reminder keys — 24 November 2026

The assistant and dialog extraction HTTP responses format new reminder keys for
`X-App-Build: 284`. This client stores a key starting with `nemory:` verbatim.
Other keys are wrapped with a percent-encoded source ID which this build decodes
again on the way to the reminder editor. The compatibility key uses a digest of
the user, extraction source and turn trace (HTTP request ID as fallback), plus
the reminder's position in the result. A retry of the same turn retains its
keys. The adapter only formats creations. Existing local records retain their
keys, and the old protocol's rule against AI cancellation still applies.

## Play 284 conversation reminders — 22 November 2026

The conversation reply and the separate legacy action extractor use the local calendar day of the user's message. For a message sent at 00:39 on 22 November in Europe/Kyiv, “tomorrow at 19:00” resolves to 23 November at 19:00. The backend resolves the extractor's `today` and `tomorrow` labels before returning the existing `scheduledReminders` date and time fields. Explicit dates keep their supplied meaning.

The 284 chat instruction acknowledges scheduling when an explicit reminder has clear timing. The phone executes the reminder after the reply. Other planner types still use the manual creation instructions. The production phone regression needs a repeat after backend deployment.

## Journal dialog with two plausible sources — 20 November 2026

When both the open entry and the planner fit a reference such as “my list”, the journal follow-up asks which source the user means and waits. When the source is clear, it answers directly. This replaces the existing dialog introduction in `buildJournalTask`. The new introduction uses 39 tokens, down from 51 with `o200k_base`. The protected psychological and practical guidance matches the previous rendered text. The largest main instruction in the 288-configuration budget check uses 2,987 of 3,000 tokens, including the reserved creation marker. This measures instructions separately from user content and history. Live verification of the revised instruction is pending.

## G02.2: wait for the complete requested planner — 10 November 2026

The main responder offered a two-stage goal while the third requested deadline was still pending, emitted a creation marker and promised to add the missing stage later. Luna correctly rejected it. Strengthen the existing shared V2 capability instruction rather than adding a goal-specific exception or changing the executor.

Before: `Keep settings/period counts≠dates;no invented dates/links/media. Clarify essentials/conflicts/unsupported,never HEX/emoji:one question+reply here;wait,no success claim.`

After: `Keep settings/counts≠dates. Clarify essentials/conflicts/unsupported here,no HEX/emoji. Await all:no creation/marker/success, invented/omitted/deferred parts.`

Also compact the technical lead-in: `Exact UI labels;suggestions:no pressure/duplicates.` → `Exact labels;no pressure/duplicates.`

This applies to all current V2 planner types and shared response modes. Psychology, practical usefulness, concrete steps, Luna instructions and persisted data are unchanged. Main instruction budget: maximum3000 across288 configurations including marker reserve and enabled weekly event intervals. The measurement script previously omitted eventWeeklyIntervalSupported, understating the limit; it now includes the active feature. History and request content are measured separately. Provider calls are mocked in automated regressions; live G02.2 acceptance remains pending. No paid provider requests: fresh/cached input 0, output 0, credits 0.

Validation: 154 tests PASS across prompt compaction, shared system builder, V2 command normalization and three extraction adapters (after rerunning the budget suite following compaction); protected psychological paragraphs match byte-for-byte. TypeScript and diff checks PASS. Shared instruction assertions cover entry/check-in/dialog/conversation/period modes and four UI locales. Provider output is mocked: this does not establish live-model compliance. Manual map remains42/63 passed,21 remaining; repeat G02.2 next.

## Standalone conversation isolation — 10 November 2026

User explicitly superseded the shared-commitment exception: conversations use their own history only and never export global commitments. Optional `conversationOnly` on assistant extraction retains planner commands/audio/clarifications, clears global action context, skips commitment repair and strips exported memories/commitments/legacy reminders. The frontend enforces the same output boundary and does not persist chat promises globally. Existing conversation commitment rows are excluded from diary context by source joins without changing the rows. Explicit V2 planner/reminder creation remains. Exact prompt replacements and validation: [conversation-isolation-20261110.md](conversation-isolation-20261110.md).

## G02: clarification must not create a legacy reminder — 10 November 2026

V2 extraction requests carry `plannerCreationVersion=2` even while the main assistant is asking a question (`plannerCreationSupported=false`, no creation marker). Previously this disabled planner normalization but left `scheduledReminders` available to the legacy executor. The initial goal clarification could therefore create a separate deadline reminder before the goal existed.

Both assistant/action-only and dialog extraction now apply `plannerCreationBoundary` after extraction and commitment repair. V2 returns no legacy reminder creations/updates; clarification turns also return no planner commands. Explicit V2 reminders remain in the validated `plannerCreations` batch alongside other requested planners. Older clients without version 2 keep their existing reminder protocol. Memory and conversational commitments are preserved.

The shared frontend `withPlannerCreation` also drops planner/reminder actions from unmarked answers, including stale-server responses. Marked V2 batches discard the parallel legacy reminder representation while retaining explicit reminder commands and receipt-based replay protection. Entries, check-ins, dialogs, conversations and periodic analyses reuse this boundary through the existing two extraction adapters. No prompt, schema, persisted planner or notification queue was changed.

Regression: `planner-clarification-boundary.spec.ts` exercises both clarification turns, final complete goal, standalone/mixed V2 reminders, legacy clients and fallback repair through three real adapters with provider I/O mocked. Frontend tests cover unmarked replies, null extraction, V2 batches and replay; existing deadline scheduler tests cover one notification per due day. Phone acceptance remains a fresh G02 run; the previous extra reminder is intentionally untouched.

Validation: frontend137/137 PASS; backend112 PASS/7 failures in broader unchanged memory-capsule tests (removed discipline/diagnostics/fallback methods, old prompt wording and usage-call signature expectation). New boundary15/15 and recurrence clarification16/16 PASS. Both TypeScript checks and scoped lint PASS. No paid provider requests or current-data changes. Main instructions, psychology and token budget unchanged.

## H04.1: daily targets on selected weekdays — 9 November 2026

The live batch correctly described a daily target but persisted its second habit as weekly/specific_days. The manual form and `habitCreationConfig` already keep target period separate from allowed weekdays; no storage conversion or data repair is needed. Exact raw Luna output was not retained, so the failure does not establish the model's internal reasoning.

Replace the existing V2 extraction rule:
- Before: `frequency=target period: day=daily, week=weekly; habit.daysOfWeek filters days; windows share target.`
- After: `Per selected day→daily+habit.daysOfWeek; weekly ONLY for explicit weekly totals, never weekday names; windows share target.`
- Equivalent compaction in the same habit line: `reminder.daysOfWeek only for frequency=weekly; daily omit it.` → `reminder.daysOfWeek:weekly only; omit for daily.`

The expanded planner instruction remains 1308→1308 o200k_base tokens. Only those two replacements were made; the main prompt, psychology, practical usefulness and concrete steps are unchanged. Existing habits are untouched. No heuristic silently rewrites weekly commands: explicit weekly totals with selected days remain supported.

Regression coverage: three real extraction adapters receive the rule and preserve a mixed batch for both daily/custom-unit and genuine weekly targets; provider responses are mocked. Frontend executor coverage checks two separate saved payloads, exact custom unit and weekdays, no reminders, no duplicate on replay, and the live daily/weekly period selector. 79 backend + 78 frontend tests PASS; backend TypeScript PASS. Protected psychological/usefulness/step blocks match their hashes; main instructions max2989 across36 localized mode combinations. No paid provider calls (fresh/cached input0, output0, credits0). Live Luna compliance remains pending a user-created H04.1 retry.

## Weekly event intervals — 9 November 2026

New optional `eventWeeklyIntervalSupported` is propagated through current-client entry/check-in/dialog, conversation and period HTTP/socket paths. It defaults to unavailable. Main V2 capabilities replace `step1` with `step1;event weekly interval1–52` only when enabled; extraction replaces `Step=1 only.` with `Step=1; only weekly event supports interval?:integer1..52 (default1), weeks anchored to startDate.` Psychological, usefulness and practical-step blocks remain unchanged. No additional AI call or billing change.

The existing V2 action validator accepts optional integer `interval` only for weekly events, range1–52. Response normalization rejects the entire batch for clients lacking the capability, never dropping the interval and returning an incorrect weekly event. The frontend advertises the capability and uses the same generated validator; persists interval in existing event metadata and reuses event services, recurrence/end/notification logic. No new entity/table. Saved period instructions refresh this capability for the current request in both directions.

Validation:56 existing planner contract tests,16 interval/capability cases,21 prompt-compaction cases and15 provider-envelope tests PASS (108 unique backend tests); additional conversation/gateway transport regression53 PASS, total161. Provider responses are mocked. Main instruction maximum2989 in36 localized mode combinations with web/image/Qwen additions; below3000. Frontend253 relevant tests PASS, including real form composition, execution, series scopes, exceptions, DST and notification scheduling through mocked boundaries. Real model/native acceptance pending EW01–EW03; no paid replay or current data edit. Frontend docs/audits/event-week-interval-20261109.uk.md records boundaries and release scope.

## H03 follow-up: period counts and extraction roles — 9 November 2026

The real retry still persisted a date after the first rule-only fix. The user requested three weeks; the main response paraphrased a date range. Frontend persistence already preserves `recurrenceEnd`. Exact raw provider extraction was unavailable, so this is evidence of an end-mode failure, not proof of the model's internal reasoning.

Current V2 changes supersede the earlier end-mode wording below:
- Main: `Keep settings/end mode(count≠date)` → `Keep settings;period counts≠dates`.
- Extraction: `Resolve relative dates.` → `Resolve relative calendar dates; series durations stay period counts.`
- End rule: `Keep requested end mode: after N=count:N, until date=date; never count→date. Inclusive date/count includes first; independent of endDate. Habit count=scheduled days/weeks, not check-ins.` → `End: requested repetitions/period duration→count; user-specified end date→date. Inclusive date/count includes first; separate from endDate. Habit recurrenceEnd.count counts frequency periods: daily=days,weekly=weeks,never check-ins; do not compute an end date.`
- Condense repeated history rules to: `Use PLANNER REQUEST HISTORY/previousAssistantText only to resolve current acceptance/clarifications, preserving authorized parameters/dates and ACTUAL PLANNER RESULT feedback. Missing evidence→clarify; never guess or replay history.` Explicit user parameters retain priority over assistant paraphrases.

V2 action-only extraction now reuses the existing static/system and dynamic/user prompt envelope already used by dialog extraction. Current exchange, history and optional period memory are data rather than system instructions. A shared parts builder also retains the combined-string compatibility wrapper. No additional model call, billing lifecycle or frontend schema change. Psychology, practical usefulness and concrete-step instructions are unchanged.

Validation: 13 provider-envelope/normalization cases, 56 shared planner validation cases, 27 related extraction compatibility cases and 73 frontend execution cases PASS (169 unique tests). Provider responses in these tests are mocked: real Luna acceptance remains pending H03. Backend TypeScript and scoped ESLint pass. The broader historical memory-capsule suite has seven stale unrelated API/prompt expectations and is not globally green. Main instruction maximum remains 2986 across 288 combinations; auxiliary instruction source-file tokens 1305→1303 (not the expanded runtime request). No paid calls or existing habit edits. H03 remains 16/60 passed, 44 remaining.

## Planner end-mode preservation — 9 November 2026

H03 real entry requested after3weeks, but the main response paraphrased it asNov9–29 and the saved command used dateNov29. Frontend already directly persists recurrenceEnd; no data conversion or schema change is needed. V2 capabilities replace `Preserve settings` with `Keep settings/end mode(count≠date)` (remaining clarification/no-invention meaning retained). V2 extraction replaces `Preserve every explicit parameter` with explicit user parameters taking priority over assistant paraphrases; series instructions now require afterN=countN, untilDate=date and prohibit count-to-date substitution, retaining inclusive semantics and scheduled-day/week versus check-in distinction. Both live entry/check-in/action-only and dialog extraction adapters consume this shared instruction. Psychology/usefulness/concrete-step blocks and legacy clients are unchanged.

Main instruction budget measured across288 combinations:2980→2986 maximum, below3000; no extra prompt block. Only these two instruction replacements were verified against pre-edit working copies. Current H03 habit is untouched and remains a date-ending record; a user-led new creation must confirm model behavior before H03 passes. No paid replay, migration or data edit.

# Shared AI response pipeline

## Planner rejection diagnostics — 9 November 2026

H01 retries at10:34/10:40 Kyiv identified two concrete backend rejections: missing `/plannerCreations/0/habit/reminder/time` (`REQUIRED_TIME`), then daily habit with `/plannerCreations/0/habit/reminder/daysOfWeek` (`REMINDER_DAYS_REQUIRE_WEEKLY`). Those failures never reached the local executor, so its console reporter could not log them; only development audit contained the reason. v2 normalization now also returns optional server-owned `plannerCreationDiagnostic` (trace, reason, counts, schema-owned issue paths/codes). Raw model metadata is ignored. Both existing extraction adapters retain this additive field; legacy replies and successful result shapes remain compatible.

`withPlannerCreation` reports `planner_creation_rejected` through the existing eventLog queue before persisting the error/clarification. Fixed localized UI explanation, original request key, backend trace, stage and issues survive privacy filtering. Private model questions/values are not logged. Old-server refusal without metadata still logs; actual request errors already owned by HTTP telemetry are not duplicated. A completed receipt suppresses late rejection reporting and clears stale diagnostic metadata. Request failures use `extract_request`, contract refusals `extract_validate`; no new polling/sink/schema, no automatic model retry.

Only the habit instruction changed: `Timed reminders: offset before windows, no additionalTimes; all-day: time+additionalTimes. Reminder days: weekly only; daily uses execution days.` → `reminder.time required even with windows: first start minus offsetMinutes. Windows: no additionalTimes; all-day: time+additionalTimes. reminder.daysOfWeek only for frequency=weekly; daily omit it.` Equivalent technical text in this same line was compacted: `at_most allows0, otherwise positive`→`at_most>=0, otherwise>0`; `check=one completion,target1,at_least`→`check=target1,at_least`; weekly-mode/default clauses shortened; redundant `preserve other units` removed because global `Preserve every explicit parameter` remains. Expanded o200k_base: habit316→314, all planner instructions1292→1290. Everything outside the habit line is byte-identical, including psychology/practical benefit/steps. Validator and persisted planner data unchanged. Test H01 remains pending actual model/user acceptance; these two rejected batches created no planners through their executor. Earlier10:16 local failure remains a separate unresolved historical cause.

Targeted validation: backend93 tests across validator/diagnostics/regular-log ingestion plus7 adapter/budget/psychology cases PASS (other102 cases in those two broad suites intentionally skipped). Frontend19 withPlannerCreation and5 plannerFailureDiagnostic cases PASS. Both repositories TypeScript, scoped lint, generated contract/catalog checks and diff checks pass. Tests use mocked provider/repository/native dependencies, not paid model calls or phone acceptance. Normalizer rejects the same invalid shapes; forged model diagnostic metadata never enters the returned server diagnostic. Main budgets cover4 locales×9 modes <=3000. No user data mutations, phone/server restarts or deployment performed.

H01 target-period follow-up: a successfully created habit persisted `weekly` although the request specified 20 pages per day with Mon/Wed/Fri execution. Replaced the habit sentence `Target is per whole day/week, not per selected day/window` with `frequency=target period: day=daily, week=weekly; habit.daysOfWeek filters days; windows share target`. Equivalent technical wording in the same habit line was shortened (window ordering/end comparison, reminder mode clauses, unit-label length and defaults). No other prompt block, psychological instruction, validator or executor behavior changed. Expanded o200k_base counts: habit block316→316; complete planner creation instruction1292→1292. The current phone habit is deliberately untouched; the correction is for future model extraction, not a migration of existing habits. Local contract/persistence-adapter tests cannot prove future model compliance; H01 still awaits a real retry.

H01 follow-up: the real retry identified root `weekdays` on a habit (`FIELD_NOT_ALLOWED`). The existing `Series` instruction now explicitly scopes root `weekdays` to daily task/event/reminder creation and directs habits to `habit.daysOfWeek`. Equivalent wording in that same line was shortened: 133→131 o200k_base tokens. No other prompt text or validator rules changed. Targeted tests cover the exact invalid habit shape, corrected H01 command, weekday support for the other three types, and <=3000 main-instruction budgets across four locales and nine modes. Real model acceptance remains pending the user's repeat.

Both assistant/action-only and dialog extraction pass the existing timing trace as `requestId` to planner normalization. A rejected v2 batch emits the local development audit event `nemory.planners.validation` through the existing privacy projection and writer (`.tmp/context-audit-YYYY-MM-DD.jsonl`). It records fixed reason codes, schema-owned JSON-pointer-style paths, counts and whether a clarification question exists; it never records field values, the model's question/error text, audio IDs or arbitrary unknown property names. An unknown property is represented by `unknownField` (known contract fields misplaced on another planner retain their schema name).

`MODEL_REQUESTED_CLARIFICATION` identifies a model-declared refusal; `VALIDATION_REJECTED` identifies contract/audio authorization rejection. `issues` reports the first failed validation predicate in the first failing command, with its array index, rather than silently discarding the command. An unauthorized audio reference has its own reason. A model refusal without a question is explicitly observable through `hasClarificationQuestion=false`; diagnostics cannot recover an explanation the model never provided. The existing `CLARIFICATION_REQUIRED` response remains compatible. Logging/sink failures cannot change validation results.

The diagnostic callback belongs to the existing shared validator; regenerate the client copy with `node scripts/sync-planner-contract.cjs`. No parallel validator, new model call, prompt modification, database migration or change to planner creation rules. For H01, retry only after the backend loads this version; the frontend does not need a rebuild to collect this backend event. Earlier sanitized failures cannot be reconstructed retrospectively.

Validation: 24 diagnostic tests, 4 audit-writer tests, 2 extraction-adapter tests and 83 frontend execution/receipt tests passed. 11,950 isolated mutated commands produced identical normalization results against the pre-change validator. Scoped ESLint and diff checks passed, and the generated contract matches. Legacy and v2 planner instruction strings are byte-identical to the pre-change snapshot. The broader memory-capsule suite still has unrelated old prompt/API expectation failures; this is not a claim that the full backend suite passes. No paid replay, phone data changes or manual restart performed. H01 awaits the user's repeat.

## Reminder recurrence creation — 7 November 2026

User correction: match the manual form exactly. New AI rules accept interval=1 only; weekday filters use daily frequency. Arbitrary interval creation was out of scope and is now rejected, while existing stored schedules/scheduler semantics are untouched. First phone attempt returned empty extracted action arrays and the app failure receipt; the root rejection reason was not retained, so it is NOT a passed native test. Safe nemory.reminders.validation now records counts/capability/reason enums only. Next user R02 uses Monday/Wednesday/Friday, three notifications, from next Monday10:00.

Explicit `reminderRecurrenceSupported === true` is propagated through entry/check-in/dialog, conversation and periodic response/extraction adapters. It is independent of old `plannerCreationSupported`; saved report instructions refresh with the current request flag. Missing/false flags advertise one-time only and filter out entire recurring reminder actions, never stripping recurrence and leaving a one-time substitute. Recurrence is optional on scheduledReminders and matches the client's existing ScheduleRuleV1 (frequency, positive integer interval, optional weekdays, end never/date/count). Strict creation validation rejects invalid bounds/dates/units; count includes the first notification and date is inclusive. New clients persist one calendar-reminder row and reuse existing scheduling/calendar occurrence logic. No schema migration, duplicate series storage or new notification lifecycle. Active AI reminder context retains ongoing series after their first date and includes the rule. Create-only protection remains unchanged. Psychological blocks remain byte-identical; complete instruction budget tests <=3000 PASS.

Local validation: backend recurrence/budget 35 PASS, extraction adapters plus related title/paragraph cases 10 PASS, gateway capability 4 PASS, conversation/period current-client capabilities 6 PASS. Frontend 97 unique relevant tests PASS across persistence/scheduler/rules/stream transport. Both TypeScript PASS; frontend lint has one pre-existing array-style warning, no errors. No paid AI calls (fresh input 0, cached input 0, output 0; not Codex quota), phone mutations, restarts or deployment. Native creation/loader/notification delivery remain pending; that original test is superseded by the manual-form correction above.

## Create-only planner policy — 7 November 2026

User decision supersedes AI reminder cancellation: Nemory may create supported planners/reminders only. The shared capabilities prompt refuses editing, completion/progress, cancellation, archiving and deletion, and explains existing manual card controls. Extraction uses the same create-only rule; normalization always returns `scheduledReminderUpdates: []`. Legacy request/response fields remain compatible. `UserRemindersService.applyExtraction` ignores updates and never overwrites existing reminders; explicit manual cancellation endpoints remain available. New frontend reminder execution also ignores updates, preserves existing rows on retry and cannot revive archived reminders. The creation receipt no longer advertises cancellation. Psychological blocks and provider/usage lifecycle are unchanged. No deployment, paid replay or phone acceptance is implied.

## Per-request client compatibility — 7 November 2026

New planner creation and web lookup require explicit `=== true` capability flags from the current request; absence is disabled. All live entry/check-in/dialog, conversation and period HTTP/socket adapters propagate `webSearchSupported` to the existing execution runtime. The web runner enforces capability, output purpose and the global switch before affordability checks or a lookup call. Disabled clients receive a short unavailable-capability instruction. Internal search actions are suppressed even for disabled clients and resolved through the existing bounded unavailable-evidence continuation, with no search API call or search fee. Actual response-generation usage remains billable normally.

`plannerCreationSupported` already guarded creation extraction; comparisons now require exact boolean true. Unsupported clients never receive extracted `plannerCreations`, even if a provider returns them. Shared capabilities forbid offering automatic creation on those clients. Saved period prompts are refreshed using the current request, never a persisted capability or account-wide flag. Existing reminder support remains. Psychological instructions, provider lifecycle, legacy/V2 billing and public response shapes remain intact. Details and verification: [client compatibility](client-capabilities-20261107.uk.md).

## Optional public web lookup — 5 November 2026

Main `tier_response` calls can request one minimized public-web lookup through the same `executeResponse` lifecycle. Shared action handling works across the existing GPT/Qwen/Claude adapters; a Luna Responses lookup returns evidence and source URLs, then the selected model answers in its original format. Internal actions are suppressed from streaming, auxiliary context/capsule work cannot browse, and the existing frontend already renders source links. Search preparation, actual lookup tokens and completed search fees flow through the existing legacy/V2 accounting. `token_usage_history.webSearchCalls` records the additional billable unit; migration/deployment required. Local implementation, validation and privacy limitations: [web-search-20261105.md](web-search-20261105.md). No production deployment or mobile acceptance is implied.

## Entry/check-in cancellation adapters — 29 October 2026, NA-58

`stream_ai_comment`, `stream_ai_checkin` and `stream_ai_dialog` now forward socket disconnect through the optional final `generateComment` AbortSignal to the existing executeResponse lifecycle. Token callbacks no longer throw a separate disconnect error that bypasses partial usage accounting. Cancellation suppresses completed-result monitoring and done events; listeners are removed in finally. Conversation and periodic-analysis streams reuse the same listener helper. Billing policy below is unchanged. Existing HTTP callers and released socket payloads remain compatible. Retest: `na-58-stream-cancellation-retest-20261029.md`; deployment and manual acceptance pending.

## Answer billing on cancellation — final user clarification, 21 October 2026

Shared executeResponse charges actual provider usage even if no answer text was returned. After successful accounting of a paid empty response it emits AI_USAGE_WITHOUT_ANSWER through the existing AiErrorReporterService/Telegram path: user, request, model, token counts, credits, abort flag; no message contents. This alert deduplicates per user/request, not globally across unrelated incidents.

The alert uses a fixed description and an allowlisted finishReason (unknown for a missing or unrecognized value). textReceived records any nonempty provider text, including whitespace, before answer validation. refusalReceived records a nonempty refusal field or delta, or Claude's refusal stop reason. Responses API diagnostics include both streamed and final output. Both flags can be true. The alert sends only these observations and the existing numeric/boolean accounting fields.

When provider usage is unavailable, the existing estimated fallback is charged only when answer text exists, including a received partial answer. An empty or reasoning-only response without usage is not charged. Structured response textField (and both shortText/fullText for reflections) is inspected so a JSON prefix alone does not count. Diagnostic provider output remains logged; no charged usage row is created for the skipped response. Cancellation still throws after accounting and cannot persist a completed domain result. Already completed auxiliary/media preparation is separately accounted; no automatic historical refunds. This supersedes the earlier blanket retain-estimates-on-abort wording. No production deployment or real Telegram delivery is implied by mocked tests.

## Soft periodic context guides — 20 October 2026

Current-period overflow now requests source preparation instead of throwing ANALYSIS_CONTEXT_LIMIT. Free estimate/context-capacity return needsCompression and never call a provider. Generate claims the existing execution ID before any paid work, compresses the localized source snapshot once using GPT-5.6 Luna through executeResponse, then calls the selected analysis model. The ordinary response prompt, note, active commitments and original DTO remain unchanged. Complete compressed evidence above the guide is accepted without retries/truncation; available history is reselected only while whole capsules fit. Source compression is separate from the usual post-analysis capsule. Empty, invalid or provider-truncated preparation is an explicit preparation failure, not evidence for the main model.

The same mechanism serves day/week/month/year. period_context output purpose has its own reasoning allowance instead of the legacy 2,048 response or 8,192 capsule cap. Actual usage is recorded in the existing analysis credit cycle with operation compress_periodic_analysis_context and included in the returned report totals. Free estimation reserves the additional Luna input/output. Abort reaches Luna and is checked again before the main model. Frontend overflow recovery preserves saved history candidates but does not pay to reconstruct more before compression. No new endpoint, database field or provider/accounting implementation. Technical transport/provider limits still exist; the product context guide no longer rejects a request.

Diagnostic events: period.context.compression_started/completed include period, token counts and usage, without source text. Native oversized-day and release-build acceptance remain pending; no real journal replay was performed for implementation checks.

## Release scope and narrow counting correction — 20 October 2026

User explicitly limits prompt work to the observed counting defect. Replaced only the existing unsupported-counts sentence in `journal-response-instructions.ts` with confirmed-event counting, supported denominators and per-period verification for continuity claims. All other prompt text, including psychological reasoning, remains byte-identical to the pre-change working copy. Shared-prompt tests 57/57, scoped lint/diff PASS. Two real API retests using unchanged synthetic source bodies removed the invented 26-working-day denominator and corrected 12 sketches to 11 with September explicitly unknown. Actual Qwen payloads confirmed the replacement. This is bounded target-error evidence, not full answer-quality acceptance.

No further psychological/main/capsule prompt rewrite is authorized for this release regression; broader quality work is deferred to post-release feedback (Memora 2834). Continue frontend/backend transport and rendering checks, including the installed build. Annual auxiliary compression still returned `over_budget`, retaining the complete capsule; no hang or automatic retry loop. Retest: 2 Qwen + 3 Luna calls, fresh input24,268/cached2,048/output7,159,514credits. No deployment. Details: `../../diary-front/docs/audits/period-hierarchy-seed-20261020.md`.

## Period user notes and synthetic hierarchy — 20 October 2026

User-authorized real-service synthetic week/month/year test exposed a dropped note in `weekCapsuleSource` and source-only recovery. Both now include nonempty `dto.note` in capsule evidence. The client restores the original same-period note from the existing report prompt via `analysisUserNote` for weekly retry/lazy recovery; a parent's fresh note is never inherited by an earlier child period. No schema, route, primary response/cache key or model changes.

Transport alone did not preserve note-only facts in a real Luna retest. The existing capsule-system instruction now explicitly treats the user's note as evidence supplied at `asOf`, including new facts, corrections and future plans. Weekly evidence names both daily capsules and that note. Main response instructions stay unchanged; the auxiliary system prefix changes once with this correction.

Real generation used historical 2025 dates, Sunday-first weeks, one fully observed September (four weeks plus compressed Sep28–30 fragment), and twelve monthly capsules with deliberately sparse other months. Final capsule retests preserve the exhibition/unknown companion, future yellow notebook, and January2026 ceramics plan. 197 focused tests and both projects' TypeScript checks pass; backend lint still has pre-existing findings. Provider source/usage checks pass. Full report: `../../diary-front/docs/audits/period-hierarchy-seed-20261020.md`.

Do not call visible response quality fully passed: Qwen invented a26-working-day denominator in the month and twelve sketches instead of eleven in the year. Capsules retained actual dates and did not adopt those false totals. Initial yearly capsule exceeded its character target after the allowed retry and was retained with `over_budget`; final capsule-only retest was1,775/1,800characters, ready. Primary responses were not regenerated. No production deployment or phone/release acceptance.

Total Nemory usage:77successful endpoint operations,83provider calls (80Luna/3Qwen); input196,379=fresh190,235+cached6,144; output36,858;1,316charged credits. All provider usage actual, not estimated. One network failure during dev-server restart was verified unclaimed/unbilled before a controlled repeat. Ignored evidence: frontend `.tmp/period-hierarchy-20261020/`.

## Qwen request-tail language reminder — 20 October 2026

Web search integration: on the initial Qwen request with a language reminder, insert the enabled or unavailable search policy before the last user turn. This keeps the selected language at the end of the outgoing request. After a lookup the final evidence message receives the same request-only reminder.

Explicit user decision supersedes the earlier no-provider-duplicate experiment below. Main entry/check-in analyses, their dialogues, standalone conversations and period summaries/dialogues supply the existing shared `buildResponseLanguageBlock` to `AiService.executeResponse` as request-only metadata. After media resolution, Qwen alone receives that same rule at the end of the last user message. This preserves selected language, explicit language-change requests and auto-detection without a second policy. Auxiliary capsule/extraction calls and GPT/Claude payloads are unchanged.

The helper creates a new message rather than mutating source/history; the reminder is neither saved into report prompts/questions nor replayed as accumulating history. Saved-report Qwen dialogue resolves the current account setting before dispatch. Affordability estimation includes the reminder; billing still uses actual provider usage. The stable system text, earlier messages, cache keys and breakpoint indexes are not changed. This preserves the existing prefix, not a guarantee that every provider call will hit cache or that the changing tail can be reused.

Validation: 242 unique focused tests passed across Qwen, shared prompt, conversation lifecycle and periodic services; TypeScript passed. ESLint passes for the shared helper and conversation service; full lint of the other two touched service files still reports pre-existing formatting/type-assertion findings outside this change. Scoped diff check passed. Five bounded Qwen diagnostics used fresh synthetic fixtures only: English day analysis; English dialogue on Ukrainian history; explicit one-turn Ukrainian exception; return to English; auto Ukrainian — all passed. First probe had zero cached tokens, following four each reported 2,048. Provider diagnostic total: 14,400 input (6,208 fresh / 8,192 cached), 797 output including reasoning; these bypass app credit accounting and are not Codex usage or dollar estimates.

One actual phone follow-up in the previously failing saved daily report also answered English on a Ukrainian question, preserving the plan/unpurchased/unknown-place facts. Trace `9b759200-6312-475a-8f20-5a5d5025acfc`: exactly one tail reminder; original system text, cache key and prefix byte-identical to the preceding report-dialog request; input9,782 (7,734 fresh /2,048 cached), output207 including reasoning. Source question/history retained no reminder. Evidence: `.tmp/qwen-reminder-native-evidence.json`, `.tmp/qwen-reminder-probe/*.json`, frontend `.tmp/qa-20261020/qwen-tail-native-answer.png/XML`. No existing report was regenerated, no database mutation or manual server restart/deployment. Local dev watch loaded the change. Native initial-period generation and release-build coverage remain separate pending checks; a bounded successful probe is not a guarantee of every future model answer.

## Response language — 20 October 2026

Latest accepted experiment: user chose variant 3, moving the existing language rule to the end. A single approved Qwen call with the full generic system prompt and a neutral Ukrainian greeting returned English. Private history/actions/profile were omitted after automatic approval review rejected replaying the original logged request. This is a positive bounded result, not an identical-payload A/B proof or native acceptance. Existing wording is now emitted exactly once at the end of dynamicSuffix, after task/output/image instructions; the shared common block references the supplied rule without the outdated REQUEST DATA location. All existing builders use this same placement, with no provider-only duplicate. The saved language-by-input commitment remains deleted. Retest selected language in a real existing conversation, explicit language-change requests and auto-detection after server update.

The one successful diagnostic call used 3,075 input tokens (2,048 cached, 1,027 fresh), 99 output tokens including 70 reasoning tokens; elapsed 6.4s. This was an isolated provider diagnostic, not an app billing/credit test. Earlier sandbox connection failed; the initially rejected full-log replay was not performed.

Placement validation: 68 conversation/shared-builder/periodic tests, backend TypeScript, scoped ESLint and diff-check passed. Runtime scope is all consumers of this shared builder: entry/check-in analyses and dialogs, standalone conversations and periodic analyses. Only the standalone conversation-shaped neutral prompt received a live Qwen diagnostic; other consumers have assembly tests, not live-model acceptance.

Follow-up evidence, same date: actual local audit records at 09:05/09:10 UTC show the strengthened English system rule reached Qwen, while replies were Ukrainian. Subsequent GPT/Claude records contain the same rule and English replies, matching the user's report. The request also contained a previously persisted language-by-input style commitment in activeCommitments. This is a verified competing preference, not proof of the model's internal reason. The user explicitly rejected adding another prompt rule and requested deleting that commitment. Reverted only the proposed saved-commitment priority sentence and its added test fixture, retaining the approved language rule below. Deleted exactly the verified commitment in the running app through the existing SQLite module with ID/key/content/status guards: changes=1, remaining=0, total commitments 5→4. No other commitment, conversation or settings changed. No additional paid generation was run; Qwen output without that saved preference needs a retest.

Explicit user decision: configured response language controls new responses even when the current message and earlier conversation use another language. Writing in another language is not a switch request. An explicit request to communicate in another language overrides the setting for its stated scope. With no configured language, use the latest user's message language, with the same explicit-request exception. The previous Russian-input/Ukrainian-output special case is removed. Necessary proper names, quotations, code and JSON keys retain their original form.

`buildResponseLanguageBlock` owns this rule for entry/check-in/dialog/conversation/periodic consumers; common instructions reference it rather than duplicating a competing fallback. `ConversationService.reply` reads current settings through `UsersService.findById` on each request. The conversation service regression exercises an existing Ukrainian history across Ukrainian, English and null settings and checks the shared-execution input, with no paid provider request. This establishes assembly, not production settings or Qwen compliance. Deployment and a real-model retest are still required.

Validation: 8 language-settings UI tests and 64 server conversation/prompt/periodic tests passed; frontend and backend TypeScript checks passed. No production request logs or native UI were inspected for this change. Exact fresh/cached/output token counters are unavailable.

## First-response tone — 12 October 2026

Latest user clarification supersedes the earlier assistant interpretation about removing feature lists: explaining functions and encouraging deeper writing after a test are wanted. The actual issue is unnatural wording such as "Вітаю з початком щоденника, Олеже — я Nemory". FIRST JOURNAL RESPONSE now asks for a complete welcome to starting to keep a journal, then a separate Nemory introduction and informal explanation of help with thoughts, feelings, connections and next steps. It uses the actual supplied profile name (Ukrainian vocative), omits a missing name, and never copies an example name. A Ukrainian wording example anchors natural phrasing while preserving configured language/style. Test replies encourage deeper personal material through one easy invitation; meaningful content receives its reflection immediately. Distress takes precedence over celebration. Existing first-entry flag, 600-character shortText limit, entry/check-in schemas, dialog exclusion and stable cached prefix remain unchanged.

Validation: 83 focused builder/length tests and TypeScript passed; no model output was generated, so these checks do not establish tone quality. No production deployment performed. Next: deploy backend and review an actual first test entry and a meaningful first entry; no seeded replay or real-user log inspection is required.

## First journal response — 7 October 2026

User requested restoring a required Nemory welcome/usefulness introduction before the first source reflection, including test content, and explicitly included check-ins. Current entry transport already carries isFirstEntry from local persistence to generateComment. The shared buildJournalTask previously only permitted a welcome for a "first meaningful entry" and excluded check-ins. It now requires a short introduction for either first source, followed by grounded source-specific reflection or test acknowledgment. Both nonempty short/full versions include it; shortText retains600-character limit. Test check-ins retain shortText-only JSON, test entries retain identical text fields, and plain-text clients remain supported. Dialog tasks return before the welcome block; the common cached prefix is unchanged.

Frontend saveCheckinEntry now returns the same transactional !hasAnyEntriesRepo(db) result as ordinary entry creation. That shared query includes all journal/check-in kinds and excludes conversation. checkins-ai.service awaits committed persistence and forwards the flag; stream_ai_checkin accepts the optional boolean and defaults to false for old clients. No new persisted flags, schemas, billing rules, promptsFoDiary legacy activation or provider changes. Scope is the initial response to a newly saved first source; subsequent analysis of an already-saved check-in retains its existing default false, as do dialogs. Existing local-history semantics remain: this is not an account-lifetime "welcome delivered" marker across deletion/reinstallation.

Validation: frontend3 targeted suites69 tests, backend2 targeted suites52 tests, both TypeScript checks passed. Includes first/nonfirst check-in persistence/transport, optional flag compatibility, both response formats, exclusion of dialog welcomes, and unchanged entry-save/access tests. Scoped lint and diff checked. No paid generation, deployment, or phone acceptance claimed. Next useful check: fresh first entry/test and first check-in/test with actual AI response after updating backend/client. Exact fresh/cached/output usage counters unavailable; no cost/quota estimate asserted.

## Qwen tier reasoning and wallet-only limits — 3 October 2026

The shared executeResponse resolves the effective plan server-side and sends Qwen thinking_budget768/1024/1536 for Lite/Base/Pro, in both streaming and non-streaming paths. Wallet-only/unknown access uses Lite. Affordability and periodic estimates use the same reasoning budget. Actual provider usage remains the billing authority; visible response guides and uncapped main-answer output are unchanged. Technical private callers without an account retain their previous1024 default.

SubscriptionUsageService.getEffectiveAiBasePlanId no longer promotes a retained expired/refunded V2 tier when access is funded by purchased credits. The existing frontend subscription helper applies the same policy to currentMemoryContextBudget (entry retrieval/rebudget and dialogue compression). A valid period with CREDIT_EXCEEDED/TOKEN_EXCEEDED preserves its tier. Null resolves to Lite in responseVisibleTokens, periodicAnalysisBudgets (including capsules), dialogHistoryThreshold and memoryContextTokenBudget. Wallet size never selects the tier. No billing balances, stored prompts or existing capsules are rewritten.

## Pre-answer dialogue compaction — 3 October 2026

Approved shared policy: above12k/18k/24k o200k history tokens, compact previous dialogue capsule plus aged turns once with Luna, targeting25% of that source; retain four recent pairs and the new question. Device-owned checkpoint in existing entry/report JSON preserves originals and survives long gaps. New compression endpoint uses the shared guarded provider/billing lifecycle. Updated Conversation clients stop silently discarding history. Stable prefix stays cache-eligible; compaction is new input once. Existing shared loader has a compression phase without timer reset. [Contracts, media boundary, validation and limitations](dialog-context-compression-20261003.md).

## Output guides and incomplete answers — 3 October 2026

Main tier responses now use prompt length guides without tariff-derived provider cutoffs. OpenAI/Qwen omit the cap; Claude uses its required provider maximum. Cost estimation remains separate from actual usage billing. Lite guides: entry/check-in700, dialogs/Conversation600, daily900 tokens. Received nonempty length/max_tokens answers are saved with an incomplete notice, with no automatic retry or assistant memory/actions extracted from partial text. Periodic persistence carries an incomplete flag and suppresses capsule generation; original day entries still participate without their own capsules. Network interruption before final delivery is not covered. [Implementation, verification and boundaries](response-output-guides-20261003.md).

## Plain mechanisms and required history examination — 3 October 2026

User approved replacing the mechanism paragraph with simple-word explanations followed by practical steps, reasons and observable outcomes. The existing continuity paragraph now requires examining supplied history and describing supported relevant connections; no extra retrieval calls or fabricated links. Existing common-builder consumers inherit both replacements. Paragraph total198->248 o200k (+50); no changes to context budgets, provider/billing, Luna or frozen snapshots. This supersedes the earlier wording below; the separate Sep18 style proposal remains unapplied. [Exact text and guarded rollback](prompt-history/20261003-plain-mechanisms/README.md).

## Explicit historical links — 3 October 2026

Approved replacement in the existing shared CONTEXT AND CONTINUITY paragraph asks for relevant past episodes, comparison of mechanisms/responses and explanation of recurrence/change. It preserves source fidelity and distinguishes shared topics from recurrence. Paragraph79→79 o200k; no context-budget, retrieval, provider or cache-lifecycle changes. Existing frozen dialogue snapshots are not rewritten. [Exact snapshots and rollback](prompt-history/20261003-history-links/README.md). Real quality awaits the next seed.

## Mechanism-focused analysis — 3 October 2026

Approved in-place common, entry/check-in and daily task replacements make full mechanism explanation the primary content; facts anchor it rather than repeat the account. The psychologist role, evidence/uncertainty rules and existing shared consumers remain. No provider, billing, context/capsule limits or response-length changes. Core1905→1906 o200k; all replaced fragments189→188. Exact snapshots and rollback: [mechanism-focus](prompt-history/20261003-mechanism-focus/README.md). Real Terra quality awaits the next run.

## Missing period capsules and monthly fragments — 2 October 2026

The device now recovers missing source capsules lazily during Generate, using POST capsule/recover and the existing generateCapsule / AiService.executeResponse / PlanGuard / claimExecution / billing lifecycle. No main response is generated and no journal is stored on the server. Day evidence excludes earlier comparison capsules; week/year use validated child capsules, month uses V4 weeks and compressed uncovered fragments. Empty days are rejected before claim. Existing tiers and retries are unchanged. Free context-capacity uses analysisMessages and its exact provider token count/200-token soft stop, so history recovery stops before a candidate that would not be considered. Main current-period evidence stays complete.

POST capsule/month-fragment compresses1–7 contiguous observed days within one calendar-week segment using the week capsule policy; token usage remains monthly_capsule with generate_month_fragment_analysis_capsule operation. V4 monthly context validates non-overlap, dates/timezone/asOf and partial coverage; older clients retain their existing snapshot route. Estimate can account for supplied raw fragments, but does not include unknown recursive missing-source recovery costs. Recovery results are saved immediately on the device; capsuleOnly rows are not visible analysis cards. Unknown outcomes are never automatically replayed. See diary-front/docs/daily-scenario-month-end-20260928-30.md for ownership, pending requests, local reuse and manual seeds.

TypeScript excludes docs/prompt-history from build roots so rollback source snapshots are retained as documentation without being compiled as live application files.


## Sep27 corrections — 2 October 2026

Approved in-place replacements in journal-response-instructions and memory-fact-fidelity retain psychologist role, free grounded hypotheses and existing consumers. Common core1905→1905 o200k; extraction fidelity617→610. No new local blocks. Weekly compression now accepts a valid shorter repeat even above maximum; equal/larger or failed repeats keep the first. Daily unconditional completed-repeat acceptance and month/year behavior remain unchanged. Both attempts are billed and logged. Old capsules are not regenerated.126 targeted lifecycle/prompt/budget tests pass; real response quality pending next seed. See [snapshot, verification and byte-safe rollback](prompt-history/20261002-seed27-accuracy/README.md).

## Ordered prior-period history soft stop — 2 October 2026

Subsequent user-approved context reduction: Lite/Base minus500, Pro minus1000. Current day7500/11500/17000, week9500/14500/21000, month11500/17500/26000, year13500/20500/31000. The user reverted the entry/check-in reduction; history6000/9000/12000 stays resolved on the frontend. Existing capsule compression goals/retry thresholds and visible-answer targets are unaffected.

User approved retaining a complete last capsule even with substantial nominal-budget overage. Shared analysisMessages applies to day/week/month/year: with fewer than200 tokens remaining, stop before the next history capsule; with exactly200 or more, add the whole newest candidate and recount. If this crosses the limit, stop without removing it or considering smaller older capsules. Estimate and generation share this selection and charge/estimate actual input. Diagnostics include selectionStopRemainingTokens and contextOverageTokens.

Current-period evidence remains complete, and the existing ANALYSIS_CONTEXT_LIMIT check for an already-oversized current period stays unchanged. The change affects optional historical selection, not compression limits/retries, visible-answer limits, frozen dialogue context, provider lifecycle or billing. Entry/check-in frontend selection uses the same200-token rule, with original priority phases and an atomic source plus its dialogue capsule pairs.

## Daily capsule paid retry thresholds — 2 October 2026

User-approved Base threshold1600; proportional Lite1200/Pro2000. `periodicAnalysisBudgets().dayCapsule.retryAboveTokens` separates the paid-retry decision from unchanged prompt goals (maximum900/1200/1500, target90%). An exact-threshold first capsule is accepted. Above it, one compression call runs; a completed valid second capsule is selected regardless of its size. An oversized selected retry retains `over_budget` as diagnostic status, without discarding it or making a third call. Failed/invalid/truncated retry preserves the first complete capsule. Source observations remain deterministic; prose semantic preservation is not automatically verified. `capsuleGeneration.retryAboveTokens` exposes the acceptance threshold alongside the prompt goal. Comparison logs track selectedPass explicitly, not from status. Week/month/year policies and provider/billing lifecycle are unchanged. No regeneration of saved reports. This supersedes historical first-result fallback for oversized DAILY retries below.

Validation:104 tests passed across periodic service and daily capsule parsing, including tier boundaries, Base1629→1382, accepting retries still above the threshold, failed retries, fixed evidence, weekly behavior and accumulated charges. No paid provider calls or seed reruns.

Check limitations: full backend TypeScript still reports existing TS2589 at image-generation.service.ts:109. Scoped ESLint reports only pre-existing formatting in period-brief blocks/tests and the existing unnecessary type assertion in the service spec; no findings in added threshold logic/tests. Tracked-file diff whitespace check passed.

## Compact period discussion memory — 2 October 2026

Initial day-capsule extraction also returns optional `briefMemory` (50–100-token target), excluding previous comparison capsules from Luna's input. Main response prompts remain unchanged. Period follow-ups optionally pass `periodMemoryContext` to the existing actionsOnly extraction: one rolling brief is returned alongside current-exchange actions; historical exchanges must not replay actions. Local report JSON owns the brief/cursor. Entry retrieval attaches one brief per selected day within its existing context budget; period readers attach a dated brief update instead of raw dialogues. See [contracts, limitations and rollback](prompt-history/20261002-period-memory/README.md).

## Tiered visible-answer guides — 1 October 2026

The user approved the central response-length.ts table for all live user-facing modes. Limits describe visible main text only, excluding reasoning/capsules; prompt guidance adapts to complexity/style without padding. Effective server plan controls both prompt and runtime allowance. The shared tier_response output purpose adds model reasoning and format allowance; affordability uses that total and actual usage controls charges. Entry preview remains600characters with separate format allowance. Period follow-ups override older saved length constraints; legacy16000character rejection removed. Capsule budgets unchanged. Details and rollback: [tier-response-length](prompt-history/20261001-tier-response-length/README.md).

## Separate capsules for every period — 1 October 2026

Latest correction supersedes inline month/year capsule contracts below. Every main period response returns {"text":"analysis"}; the shared Luna capsule runner now also handles month/year with the selected context plus main answer. Existing month1500/year1800 character limits remain explicit; day/week tier token budgets are unchanged. Billing and estimates include Luna, with monthly_capsule/yearly_capsule usage types (migration1790870400000). All four capsule types use the shared period_capsule SDK budget path. Failed auxiliary work preserves the main answer; failed/over-budget second pass preserves the first complete capsule. No saved reports are regenerated. See [snapshot and rollback](prompt-history/20261001-period-capsules-luna/README.md).

## Unified common response rules — 1 October 2026, o200k budget

Follow-up correction: concrete `goalsPrompt` data belongs only to context. `buildResponseServiceBlock` excludes it; `generateComment` appends one labelled user `planning_context` before the existing context cache boundary, filtering empty content. This retains older clients' supplied data without placing it in the system prompt. Period/conversation adapters already pass empty goalsPrompt and use their own allowed context. The parameter stays compatible; shared planner interpretation rules remain.

Latest user instruction supersedes the separate compact-periodic branch below: all user-facing modes share `NEMORY_COMMON_INSTRUCTIONS` and `buildResponseServiceBlock`, followed by a mode-owned task/output contract. The <=2500 target includes capabilities, identity/time/language and all12 live style values, measured with actual `o200k_base`, not Qwen's character estimator. Reference fixture:2341 stable shared tokens,2356 including request time; arbitrary supplied aboutMe/goals remain intact and can exceed this instruction target. No new runtime truncation/rejection. Full mode prompts may exceed2500 because task instructions are separate.

Entry/check-in/dialog adapters, ConversationService and PeriodicAnalysisService use the same minimal style labels and shared language helper. Configured language takes precedence, explicit user switch allowed, necessary names/quotes/code/JSON may remain original; missing language follows current input with Russian→Ukrainian, without a false claim of not knowing Russian. Mode-specific schemas, budgets, provider/billing and Luna prompts remain unchanged. Saved report history is preserved; the existing static follow-up override applies the current common block to old prompts and appends a period-dialog task before history. Request timestamps/actions remain after stable prefixes/history as before. Snapshot, measurements, Ukrainian review translation and rollback: [common-2500-o200k](prompt-history/20261001-common-2500-o200k/README.md).

## Compact periodic response prompts — 1 October 2026

User approved approximately2500 Qwen-estimated system tokens. Period tasks now own one compact analysis/evidence block and opt out of the duplicate REFLECTION_HYPOTHESES block. Day/week no longer receive memory-compression instructions. The exact shared psychologist role and app-capabilities block remain; current style preferences and language use opt-in compact rendering. Default entry/check-in/conversation prompt bytes remain unchanged. Existing period output schemas/lengths, separate day/week Luna capsules, inline month/year capsules, frozen dialog history, accounting and context budgets are preserved. See [snapshot, measurements and rollback](prompt-history/20261001-compact-periodic/README.md).

## Generated source capsules are retained — 1 October 2026

After the Sep18 audit the user removed size-based rejection. Shared `selectSourceCompression` now accepts every nonempty normalized candidate for source, assistant and dialog-user memory, even below20% saving, at equal/greater size, or for a short original. Empty candidates still fall back to the original. The short-source prompt, compression target, schema validation, accounting, action extraction and periodic-capsule policy are unchanged. Token counts remain diagnostics; this does not establish semantic fidelity. Previously saved capsules are not regenerated.

The same audit's day system prompt has22703characters:7568 by the Qwen code-point/3 estimator,4374 with o200k_base (not Qwen's tokenizer). No provider-reported system-only count is available. Large overlapping blocks include memory fidelity1078, psychological hypotheses1421 and style1216 estimated tokens; the system prompt was inspected, not rewritten. Local evidence: `.tmp/day18-system-prompt.txt` and `.tmp/day18-system-prompt-breakdown.json`.

## Action extraction and dialogue accounting — 1 October 2026

7 November replacement/fallback correction (supersedes the fallback caveat below): removed deterministic accepted-text/hash-key/ongoing creation. The existing AI repair receives active commitments and returns a validated replacement with cancelled updates together; missing duration, unknown keys or a replacement unrelated to cancelled keys produce no change. Shared extraction rules compare meaning, condition and duration; explicit replacement includes duplicate copies of the same obligation. Code filters exact-key/content duplicates, without fuzzy semantic cancellation. Cancellation-only results do not trigger repair. Frontend source-turn replay protection runs before updates within the existing save transaction, preserving a replacement on retry. Main capabilities limit mutation restrictions to planners and honor conversational agreement changes. No migration or saved-data edits. 79 targeted tests and both TypeScript checks pass; main instruction matrix remains <=3000 and protected psychology unchanged. Backend runtime loaded the fix; phone inspector disconnected, so live replacement acceptance remains pending. No paid calls made.

7 November conversational duration correction: `COMMITMENT_DURATION_RULE` in `nemory-actions-prompt.ts` is shared by assistant capsules, action-only extraction, dialogue capsules and AI repair. Single future actions, including the next matching interaction, are `one_time`; repeated/continuing obligations are `ongoing`; a condition is not recurrence. Replaced type-based/default-ongoing prose and removed conflicting conditional-reminder examples. This does not rewrite existing commitments or change main response/psychology instructions. Retry an already stored erroneous agreement through explicit conversational replacement, then inspect cancellation of the old row and the new duration. Native verification remains pending. Deterministic fallback after both AI extractions miss an accepted request retains its prior ongoing default and is not validated for single-occurrence classification by this fix.

7 November checklist fidelity correction: shared `PLANNER_CREATION_INSTRUCTIONS`, used by assistant/action-only and dialog extraction, explicitly distinguishes the limit of6 planner creations from up to50 strings per checklist. Copy an authorized user list, or the assistant-composed list when composition was requested, verbatim and in order; no omissions/merging/rewriting and no partial over-limit checklist. Existing consent gates remain. The extraction block changes466→509o200k tokens; main response/psychology unchanged. Backend normalization and frontend executor regression tests preserve8/50items (including repeated labels) and reject an oversized checklist as a whole. Native retest is pending; do not infer model fidelity from mocked/normalizer tests. Existing saved checklist is not rewritten.

`actionsOnly:true` uses the compact `buildNemoryActionsPrompt`, billed as `nemory_actions` / `extract_nemory_actions`, with the same capsule endpoint, Luna, normalization and device action execution. Real response-capsule prompts remain unchanged. Standalone replies use `conversation`; follow-ups use `entry_dialog`, `checkin_dialog`, or `daily/weekly/monthly/yearly_analysis_dialog`. Legacy exact-operation backfill preserves costs; ambiguous period/capsule rows are not guessed. Shared billing/cache behavior and call frequency are unchanged. [Rollback, token comparison, migration and validation](prompt-history/20261001-nemory-actions/README.md).

## Current period hierarchy and unlimited audit input — 30 September 2026

The latest user instruction removes day/week/month input token ceilings and previous-history character exclusion. Estimates and generation preserve the same full selected payload and continue measuring tokens/credits. Weekly input is the current week's dated daily capsules plus older weekly capsules; day/week capsules share separate Luna generation, one conditional compression and lossless fallback of the first completed result. Capsule maxima day900/1200/1500, week1100/1350/1700. Entry/check-in memory selection uses6000/9000/12000. This supersedes the numeric period-input budgets below. Details: [current contract](period-capsule-hierarchy-20260930.md).

## Approved corrections after days10–12 — 30 September 2026

Shared live response/memory instructions preserve psychological depth while qualifying causal claims, retaining attribution, reaction/correction sequences and first-trial uncertainty. Durable-memory selection applies to both userMemory and problems, which are normalized into the same memory; existing source-ID exclusion remains. Daily capsule prompts give only the prose budget after fixed observations. Retry reduction now uses prose tokens and sends only prose; exact observations are reattached. Diagnostics distinguish total/prose reduction. One retry, fallback, billing, models and tier budgets remain unchanged. [Reversible package, validation and rollback](prompt-history/20260930-day10-12/README.md). New model-output quality awaits a seed comparison; no paid calls made.

## Daily context budgets by plan — 30 September 2026

The user approved Lite8000 / Base10000 / Pro12000 tokens for the day user-context message (full current-day data plus whole prior capsules); system instructions remain outside this budget. Start, testing, unknown and wallet-only accounts retain8000. `dayAnalysisContextTokenLimit` owns the mapping. `SubscriptionUsageService.getEffectiveAiBasePlanId` shares plan resolution with affordability: actual legacy plan for legacy runtime, otherwise the refreshed V2 subscription; purchased-credit balance does not determine the tier. Client data cannot select the budget.

Estimate and generation both call the same `analysisMessages` selector. The complete current day has priority; prior capsules are added newest-first until the next exceeds the applicable budget. Overbudget current-day data fails before claiming or paying for generation. No clipping, UI redesign, response/capsule output-limit change or change to week/month budgets. Frontend estimate already uses the backend endpoint and requires no separate limit change. Saved reports and frozen dialogue prompts are unchanged. This supersedes the fixed8000 policy below.

Validation:97 tests passed across periodic analysis, subscription usage and response billing integration; TypeScript and scoped ESLint passed. Covered exact-fit history, each paid-tier overflow before paid work, estimate/generation parity, legacy/V2 precedence and wallet-only fallback. No paid calls, deployment or new device generation. Offline replay of September12 context estimates7413 with two prior capsules,9705 with four,10956 with all five; Lite/Base/Pro would respectively select2/4/5 for that input.

## Bounded daily capsule compression — 29 September 2026

User approved target 900 / maximum 1000. PeriodicAnalysisService measures the completed Luna capsule; only an oversized result triggers one executeResponse call containing that capsule alone. The rewrite requests a computed percentage reduction toward 900, preserving evidence and attribution. Both calls use DAILY_CAPSULE with distinct generation/compression operations and one trace, normal affordability/accounting and accumulated actual usage. The maximum estimate includes the conditional pass. Existing completeAiPromptUsageCycle is exposed to this orchestrator so diagnostics close once in finally, including auxiliary failures.

The first complete capsule is retained before compression and returned to the device if the second output is invalid or still exceeds 1000. capsuleGeneration reports ready/over_budget/failed, selected tokens, attempts, originalTokens, reductionPercent and accumulated credits. Complete shorter output no longer fails a minimum 850 rule. Malformed/incomplete first output is not promoted into usable memory. No server persistence, whole-day replay, automatic network retry or changes to entry/check-in limits.

## Device-owned periodic reports — 29 September 2026

PeriodicAnalysisService no longer has a report repository, CryptoService dependency or persisted conversation state. Generation returns the same report payload for existing SQLCipher storage. Frontend sends dated previousAnalyses capsules selected from the current local account; backend applies the existing period/asOf/timezone/nonoverlap/budget rules to those supplied capsules only. Dialogue sends the frozen local report (prompt, original reply, previous turns), validated by the shared service before using the unchanged executeResponse/provider/credit lifecycle. Old locally saved prompts retain their compatibility override. No model prompt or compression budget was changed by this storage migration.

AiCreditCycleService now also claims an execution with Redis SET NX EX 900. This stores only a technical marker and does not authorize payment, retain content, replay a response or promise unbounded exactly-once execution. Frontend blocks concurrent taps and does not automatically repeat uncertain paid requests. A lost response cannot be recovered from the backend; the UI warns that another explicit attempt is a new paid call. Existing authorization, usage history, legacy plans and V2 wallets remain authoritative.

Legacy HTTP/socket routes remain. GET collection is empty; GET report returns 410 ANALYSIS_LOCAL_ONLY (not 404, which old clients could treat as permission to resend). A dialogue without device context fails explicitly before a model call. Deploy the periodic-analysis client/backend together; retaining old content-dependent dialogue behavior would violate the new retention requirement. Entry/check-in protocols remain unchanged.

Removed the ORM entity/registration and added migration 1790712000000-RemoveServerPeriodicAnalyses. No content backup is made. Local localhost/nemorydb verification/application found the table already absent (0 reports removed); all 44 usage-history rows were unchanged. No production migration/deployment performed.

**Diagnostic boundary:** user explicitly requires the existing full development file logs for context/capsule/answer analysis. They are restored, including frontend diagnostic transport, source dates/metrics, exact SDK JSON/Markdown and memory-review files. No additional device log store is introduced and old files were not deleted. These development files must not be confused with the separate production quality-monitoring table (no account FK, seven-day cleanup). The attempted metadata-only/device-file logging change was reversed; do not repeat it as part of report-storage work.

Validation: focused periodic/provider/gateway/legacy+V2 billing and frontend persistence/dialog tests; TypeScript checks; full development log restoration verified with a real synthetic file write, no paid AI calls. Device generation and deployment remain unverified.

## Period snapshot character limit removed — 29 September 2026

User explicitly requested removal after the September 13 seed's weekly step hit `ANALYSIS_CONTEXT_LIMIT`, to manually generate and inspect the existing full weekly context. Removed the 60,000-character snapshot guard from frontend collection and backend period validation. No source selection, truncation, prompt, daily capsule inclusion or history policy changed. The day-only 8,000-token context budget remains. Periodic-analysis HTTP JSON bodies allow 1 MB (instead of Express's default 100 KB) so the estimate/legacy HTTP routes can carry the same larger snapshots as the existing socket flow. Other HTTP routes retain their defaults. Transport/provider limits still apply; generation is user initiated.

## Daily context budget — 25 September 2026

`DAY_ANALYSIS_CONTEXT_TOKEN_LIMIT=8000` bounds the day user-context message, including the complete collected snapshot, clarification, period/time metadata and previous-analysis capsules. The system prompt is outside this budget. `PeriodicAnalysisService.analysisMessages` builds the exact same messages for estimate and generation; request IDs and other DTO transport fields are no longer included only in estimates.

The complete day is counted first using the existing model-aware `countOpenAiTokens`. If it exceeds 8000, a normal BadRequest is returned before a report is inserted or a provider called; no source text is clipped or selected by similarity. Otherwise completed prior analyses are selected newest-first with the existing owner/timezone/asOf and nonoverlap rules. Whole capsules are added until the next cannot fit. Pagination removes the former 10-report/7000-character cap for daily context. Week/month retain that historical policy. The existing 60000-character transport safeguard still applies.

For non-OpenAI providers the shared tokenizer is an offline estimate, not a guarantee of actual billed provider tokens. A roughly 11000-token total depends on actual system instructions/settings; provider usage remains the billing authority. Saved reports/dialog prompts are not rewritten. This budget does not repair the separate periodic-snapshot mapping omissions recorded in the day8 audit.

## Memory factual precision — 25 September 2026

`src/ai/utils/memory-fact-fidelity.ts` supplies shared source-grounding rules to user, assistant and dialogue memory extraction and the periodic capsule instruction. Preserve source attribution, dates, uncertainty and the difference between suggestions, intentions and confirmed actions. Do not count an intended repetition as another completed occurrence. A capsule can omit an unsupported statement from its source AI response rather than preserve the error. JSON contracts and main response-task instructions are unchanged.

The frontend now indexes newly saved morning/before-sleep check-ins without producing an AI reflection: exact authored answers enter the existing V2 capsule/index through `saveCheckinWithAiPreparation` and `saveEntryRetrievalIndexV2Tx`. One embedding request uses existing effective-access checks and the protected endpoint; no parallel billing path. Existing check-ins are not backfilled automatically.

User explicitly deferred collective main-prompt changes; observations live in `diary-front/docs/ai-prompt-review-observations.md` (Memora 2711). The day8 audit addendum distinguishes verified prompt assembly from unverified model compliance and records remaining periodic-snapshot field omissions. V2 memory's 6000-token similarity transition does not apply to periodic snapshots: those use the existing 60000-character snapshot ceiling and previous-analysis capsule selection.

## Optional response formatting — 23 September 2026

The shared journal instructions (entry, check-in and both dialogue modes) and day/week/month analysis tasks now include the same `RESPONSE_FORMATTING_INSTRUCTIONS`. At the user's explicit correction, the model freely chooses Markdown formatting and structure to suit the content or requested style: headings, bold/italic/strikethrough, lists, quotations, tables, links and code. There are no added restrictions on decoration, heading use or table width. Formatting applies to user-facing text, including JSON text/shortText/fullText string values. JSON schemas, capsule content rules, existing length ceilings, style preferences and provider/billing contracts remain unchanged. Markdown characters count toward the existing limits.

Existing saved answers are not regenerated. Periodic follow-ups continue using their persisted prompt, so the new instruction is included in newly generated period reports and their subsequent dialogues; historical reports keep their saved prompt. Journal source/dialogue pairs retain identical shared prefixes. This is a live prompt change explicitly requested by the user, separate from historical review proposals.

## Image API comparison — 20 September 2026

User-approved scope: OpenAI requests containing resolved images use Responses;
text-only OpenAI requests remain on Chat Completions for comparison. Qwen and
Anthropic keep their existing provider paths. This applies to initial responses
and dialogues that reuse source images, including streaming and nonstreaming.

`generateOpenAiChat` / `streamOpenAiChat` build the existing ordered prompt and
cache markers, then delegate image transport to `generateOpenAiResponses`.
`utils/openai-responses.ts` converts that same request: input_text/input_image,
assistant history output_text, text.format, reasoning.effort and max_output_tokens.
Prompt text/order, cache key, model and output limits are preserved. Responses
ignores cache markers on historical assistant output_text. The adapter removes
those unsupported markers and moves each boundary to the end of the next existing
nonempty input message. Thus the first dialog caches through the existing dialog
task, including source text, photo and original answer. Later boundaries also
include the current question, which is reusable as history in the next turn.
Earlier selected boundaries are retained. No empty/synthetic separator messages
or role changes are introduced. Chat Completions/Qwen/Claude policies are unchanged.
No server conversation storage or previous_response_id is introduced; store=false.

Both endpoints return the same ChatGenerationResult into executeResponse's
structured-text streaming, token-history persistence and legacy/V2 plan/wallet
accounting. Responses input_tokens_details is normalized for the existing cache
read/write helpers; output_tokens includes reasoning. Abort estimates remain
explicitly estimated. No automatic fallback or duplicate paid retry is introduced.
Failed or prematurely ended Responses streams do not become successful results.

Request JSON/Markdown now support Responses input and redact image base64.
Raw usage includes api, firstTextMs (stream only), durationMs and cache fields,
preserving absent counters versus reported zero. HTTP diagnostics retain the
actual endpoint and request IDs. Frontend/socket contracts are unchanged.

Latest live synthetic validation using the production converter, after correcting
assistant boundaries: entry wrote 2475; successive dialogs read 2475 / 3571 / 3643 /
3676 and wrote 1096 / 72 / 33 / 33. Source image is included before those boundaries.
This supersedes the earlier common-prefix-only test. See the investigation report.
User-led app validation: new Terra entry with opted-in photo, then two different
follow-ups; compare raw usage and persisted token history with the previous Chat
Completions logs. Existing source/time/order issues are outside this transport change.

Validation: TypeScript and scoped ESLint pass; 47 targeted tests pass (10 Responses
adapter, 29 shared access/billing, 8 request diagnostics). These include legacy/V2
image accounting, purchased credits, text/Qwen routing, stream/nonstream, output
limits, cancellation, errors and safe readable request logs. No device test claimed.

Accepted architecture rule: 19 September 2026. Extend the established flow. When improving a shared mechanism, move existing and new consumers together; do not create parallel response/billing implementations. Keep legacy plans until all existing users upgrade and the user explicitly authorizes retirement.

## Active paths

Planning-context update, 20 September 2026: `JOURNAL_COMMON_INSTRUCTIONS` owns the descriptions and interpretation rules for goals, habits, tasks, events and reminders. New frontend contexts contain one factual `[PLANNING_CONTEXT]` JSON block; they no longer embed goal-specific advice instructions. Entry/check-in and their dialogs share these rules, while `RESPONSE_TASK` still defines the response task. Older text contexts remain accepted, saved conversation snapshots are not rewritten, and provider/cache/billing contracts are unchanged.

- Entry/check-in/dialog socket handlers in `src/ai/gateway/ai.gateway.ts` retain their event names, arguments and response envelopes. They call `AiService.generateComment`, the existing context adapter.
- Periodic socket handlers and the retained HTTP controller call `PeriodicAnalysisService`. This adapter owns period validation, source/history selection, encrypted storage, locks and request deduplication.
- Both adapters build system instructions through `buildResponseSystemPrompt` in `src/ai/utils/response-system-prompt.ts`. Optional task instructions replace only task-specific analysis/output rules. Identity, language, style and addressing remain shared. Periodic analysis selects the approved shared blocks and omits the developer marker and app-capability block. Existing callers retain both blocks and their reminder capability by default.
- BOTH adapters call `AiService.executeResponse(AiResponseRequest)`. This is the single response provider/streaming/usage lifecycle. `generatePeriodicAnalysisResponse` has been removed. Do not add another provider-and-billing response wrapper.

## Access and charging

1. Existing JWT authentication and `PlanGuard` protect generation/dialog endpoints. Free report reads retain their existing ownership checks.
2. `PlanGuard` keeps the existing legacy-plan and V2 effective-access logic. V2 combines plan balance and purchased wallet balance, checks the existing 500-credit reserve and authorizes the credit cycle.
3. Legacy routes still use `timingTraceId`. Periodic generation/dialog routes explicitly declare `@AiCreditCycleId('requestId')`; HTTP clients without timingTraceId and socket clients therefore authorize the exact ID later passed to billing. This annotation chooses a field, not a different access policy.
4. `executeResponse` uses the existing OpenAI/Qwen/Anthropic helpers, structured progress parser and `persistAiUsage`. Observed provider input/cache-read/cache-write/output usage is retained.
5. `persistAiUsage` writes token history and calls the existing `SubscriptionUsageService.recordAiUsage` with the same cycle ID. Legacy charging and V2 plan-first/wallet-second/debt rules remain in that existing service; no new tariff implementation or migration was introduced.
6. Observed partial usage is recorded for a stopped stream; partial reports are not marked completed. An interruption before usage becomes observable cannot establish exact provider charges. No automatic paid retry is added for periodic requests.

## Period analysis prompt — approved 19 September 2026

`periodic-analysis/periodic-analysis.prompt.ts` owns the English translation of the approved compact prompt. `buildPeriodicAnalysisTask(kind)` selects the lived day/week/month task and text ceiling (2500/2875/3250 characters). Analysis rules and concise entity descriptions are shared. The full user-approved continuity capsule instructions are retained, with 900/1200/1500 character limits. The parser uses these same capsule limits and retains its existing tolerance for compatibility. The prompt limits remain model instructions, not destructive text truncation.

The domain service feeds this task into the existing common system-prompt builder for both estimates and generation, retaining identity, informal address, language, time and user style. Entry/check-in prompt fixtures remain unchanged. The former arbitrary limit of one or two observations and one step is removed. Initial output remains `{text,capsule}`; follow-up output remains plain text. Previously saved prompts/results are not rewritten or regenerated automatically.

Measured using o200k_base and actual shared default style/language builders, with synthetic user/time and no data/history: day 2310, week 2332, month 2327 tokens. User settings and payload change the total. Review source: workspace `output/periodic-analysis-compact-review.json`; assembled English examples and counts: `output/analysis-*-production-en.txt`, `output/periodic-analysis-production-counts.json`.

Known data gap: overall goal/habit progress is not yet fully sent by the frontend. The prompt describes optional fields; it cannot infer missing statistics. Context collection, hierarchical weekly/monthly capsules and a 6000-token context budget are separate work, not implemented by this prompt change.

## Context, dialogs and compatibility

Source metrics placement (20 September 2026): current journal-entry clients store metrics alongside mood in the existing `entryResponseContext.sourceMessage`. On initial generation `generateComment` reads this exact user message from the existing `memoryContextJson` parameter when protocol, snapshot version, source kind and supplied source timestamp match. The current-time suffix remains unchanged. Dialogs already send the persisted source message. Missing/invalid/older-client payloads retain the existing renderer; saved old contexts are not rewritten. Shared billing, provider dispatch, cache markers and periodic analysis are unchanged. The frontend reuses the existing named-metric formatter (including custom scale labels) rather than sending raw storage metadata.

Creation timestamps (20 September 2026): periodic generation and dialog HTTP/socket DTOs accept optional ISO `createdAt` with time and timezone. An omitted value uses server request time. Reports retain the existing `created_at` column; dialog timestamps are optional fields in encrypted history for old-data compatibility. Period boundaries and context `asOf` remain separate. Deduplication/replay preserves the original creation time and usage lifecycle. Frontend seed contracts are documented in `diary-front/docs/entity-creation-time.md` in the workspace. No storage migration or prompt change is required for this contract.

Periodic generation freezes the exact prompt, full response, capsule and metadata in the existing encrypted result. The initial model output remains `{text,capsule}`. Subsequent dialog output is plain text and billed as DIALOG; repeating an unchanged capsule on every turn is removed.

New saved reports have an optional `promptVersion: 2` inside encrypted JSON; no database migration is required. Old reports without this marker retain their original prompt, initial response and previous JSON dialogue turns. Their follow-up request appends a plain-text response instruction; stored history is not rewritten. API consumers still receive the report/dialog answer fields. Old HTTP routes remain adapters to the same execution function, not a second model implementation.

Legacy generateComment call signature and short/full/plain output variants remain. Provider defaults, entry/check-in cache policy, model normalization and old socket event names are preserved. Do not infer provider cache hits from our cache key; Qwen does not receive the OpenAI key. Verify actual cache usage separately.

## Debugging and regression tests

Follow one request ID through PlanGuard cycle authorization, the request adapter, executeResponse, token history and SubscriptionUsageService. Periodic development console output remains expandable request/response objects; inspect mode, model, exact messages and provider usage. Do not log journal context in production.

- `response-billing.integration.spec.ts`: real guard, cycle authorization, response executor, usage persistence and subscription usage service with synthetic provider/DB/Redis boundaries. Covers legacy, mixed credits, purchased-only access and insufficient reserve through entry/dialog plus periodic HTTP/socket adapters.
- Existing `guards/plan.guard.spec.ts` and `subscriptions/subscription-usage.service.spec.ts`: inactive/expired/blocked states, authorized-cycle completion/debt and both subscription generations.
- Existing Qwen/Opus/gateway/structured-progress tests: old response/streaming contracts.
- `utils/response-system-prompt.spec.ts`: reviewed common/task separation, one-time welcome, source data, short/full/plain output and period task checks. Historical prompt hash fixtures document the former implementation only.
- Periodic service/provider tests: ownership, source deduplication, failure/stop, frozen context and old saved-report dialogue continuation.

Mock-provider tests are not evidence of real cache hits, deployed-server behavior or full device acceptance. No real paid generation or phone action is required for the automated checks above.

## Periodic response length (19 September 2026)

User-approved prompt ceilings use characters, including whitespace/Markdown: day 2500, week 2875 (+15%), month 3250 (+30% from day). Capsule budgets remain separate at 900/1200/1500. The shared style builder keeps qualitative preferences but accepts includeLengthExecution=false for tasks owning their numeric limits; existing entry/check-in/dialog defaults stay unchanged. No response slicing or paid retry was introduced. Provider token caps remain 2400/3400/3400, and 1800 for report dialogs. Previously stored prompts remain frozen for continuation.

## Historical entry/check-in cache rollback — 19 September 2026 (superseded below)

The source-first cache experiment was rolled back at the user's request using
PhpStorm Local History, revision **Before 19.09.2026 16:52**. The exported IDE diff
was compared against the current directory; only the cache/prompt changes were
reversed. Readable provider-request logging remains. Earlier periodic-analysis,
provider, plan/wallet and compatibility changes remain intact.

`generateComment` again builds the existing mode-specific system prompt, followed
by memory/retrieved context, the original source and initial reflection for a
dialog, completed dialog turns, and the current source/question as a user message.
Context is no longer moved into system JSON; the `Respond to currentSource`
message and JSON `{text}` transport for entry/check-in dialogs are removed.
Dialog output is plain text; initial short/full reflection keeps its original
structured-output option. The temporary cache helper, its experiment-only tests
and paid live-probe script were removed together.

The pre-experiment cache policy is restored: `shouldUseResponsePromptCache`
enables explicit response cache for dialog/check-in dialog, not the initial
entry/check-in response. Existing provider helpers and provider-reported usage
accounting are unchanged. This rollback does not claim initial-response cache
reuse has been fixed; that work is deferred until real entry/dialog payloads are
reviewed together with the user.

Important: `USE_MINIMAL_RESPONSE_PROMPT_EXPERIMENT = true` predates the reverted
changes. It still omits the full dialog method/discipline while retaining the
longitudinal contract. It was deliberately not changed during rollback. Restored
historical behavior is not proof that the model now handles a trivial dialog
message appropriately; inspect the actual logged request before changing rules.

### Readable provider requests (19 September 2026)

Development runs write each initial response and dialog request separately to
`.tmp/ai-requests/<UTC timestamp>-<mode>-<unique id>.md` and `.json`.
The console prints both paths after the files are written. Markdown shows ordered
system/user/assistant blocks, decoded source-context fields, the shared-prefix
boundary and actual provider cache markers. JSON preserves the exact SDK request
body (not credentials or transport headers). The shared-prefix marker is a cache
candidate, not proof of a hit. See the current provider policy below.
Production does not write these files. Existing usage snapshots remain unchanged.

## Current entry/check-in prompt and cache — 20 September 2026

The user authorized the compact reviewed prompt for entries, check-ins and both dialogs. The minimal-prompt experiment is removed. journal-response-instructions.ts owns common instructions and distinct reflection/dialog tasks; response-system-prompt.ts adds configured language, name, timezone, profile, goals and compact style preferences. Source metrics remain a separate context message. The one-time entry welcome and short/full output switch belong only to the variable task. Current request time is appended to the current source/question, outside the reusable prefix. Periodic tasks retain their approved separate instructions.

Request order through the existing generateComment / executeResponse lifecycle:

1. Initial: common system instructions → source metrics and saved context → reflection task → source.
2. First dialog: identical common/context → original source and initial answer → dialog task → question.
3. Later dialog: identical base and dialog task → every completed question/answer → current question.

Only the common instructions use system role. Supplied context and application task messages use user role in sequence, avoiding Anthropic system-message hoisting that would change the shared prefix. The system explicitly explains the standalone RESPONSE_TASK instruction. Cache boundaries mark the common prefix, end of context, and last two completed assistant turns (at most four markers). Keeping the preceding boundary enables a lookup before advancing. Routing identity uses common/context, not growing history. New source context/history starts a new conversation; changing profile/style or refreshing saved context can invalidate the shared prefix.

OpenAI models supporting explicit cache use prompt_cache_breakpoint/options; older models retain implicit behavior. Qwen3.8 Max uses cache_control ephemeral blocks without OpenAI keys/options; its cache_creation_input_tokens usage is retained and charged at the configured 125% write rate. Existing Qwen read rate remains unchanged. Anthropic retains ephemeral five-minute markers. These are prefix caches, not arbitrary independently reusable named blocks. Actual cache hits must be verified from provider usage.

Frontend buildDialogsPrompt sends all completed stored turns verbatim with the existing Q:/A: prefixes, excluding the current question and placeholder. No history compression, capsule substitution or token-budget truncation remains in entry/check-in dialogs or the shared debug seed. Memory extraction for future related entries remains separate. Long conversations still have the provider's finite input limit; there is no hidden compression fallback.

Development diagnostics: .tmp/ai-requests writes one .json exact final SDK payload and one .md reading copy per provider request (streaming and nonstreaming, all providers). Markdown contains only ordered model-input messages with readable context fields; JSON retains request parameters and actual cache markers. Full responses, usage, context assembly and persistence events remain in .tmp/context-audit-YYYY-MM-DD.jsonl/.md. No credentials or transport headers are logged; production logging is disabled. File evidence is asynchronous and a missing log is not evidence that a request matched.

Tests cover real generateComment assembly across initial and seven dialog turns, retained cache endpoints, unchanged text through provider adapters, mode separation, optional short output, one-time welcome and shared billing. Mock tests are not proof of a real cache hit. Next validation is user-led entry/check-in generation plus consecutive dialogs, comparing final payloads and provider usage.

### Qwen automatic-cache comparison — current mode, 20 September 2026

After a live explicit-cache hit (1643 read tokens) and an expected miss after a 13-minute pause, the user requested testing Qwen without markers. Both Qwen provider paths now forward the same ordered string messages without cache_control or OpenAI cache parameters. The unused explicit-Qwen decorator was removed; OpenAI/Claude policies remain unchanged. Diagnostics report qwen_implicit with no breakpoint indexes. Actual provider cached_tokens and cache_creation_input_tokens continue through the shared usage/billing/logging lifecycle; existing rates are unchanged for this comparison. This supersedes the Qwen explicit policy above. No claim of automatic hit or longer retention is made before live testing.

User test: create a Qwen entry and send consecutive follow-ups; inspect the new final SDK JSON to verify no cache markers, then compare provider usage. A later follow-up after a pause can assess retention, but one hit/miss cannot establish a guaranteed TTL. No synthetic paid model calls are run by the assistant.

### GPT-5.6 Terra automatic-cache comparison — historical test, 20 September 2026

The user also requested marker-free Terra testing. The existing getOpenAiPromptCacheOptions policy now returns undefined for gpt-5.6-terra (including snapshot IDs). Both response paths therefore send original string messages, without prompt_cache_breakpoint or explicit-only prompt_cache_options. Stable prompt_cache_key routing remains: it is not a cache boundary or explicit-mode selector. Diagnostics report implicit and no breakpoint indexes. Luna's explicit memory cache and Claude remain unchanged; Qwen stays automatic. Provider usage, credit rates, prompt text/order, and request/response file logs are unchanged. Live Terra cache hits are pending user verification.

Terra validation: provider stream/nonstream tests and cache-policy tests pass; tsc and scoped ESLint pass. A broader memory-capsule-v2 run exposed five failures outside this switch: obsolete buildDialogResponseDiscipline test, extraction wording assertion, two removed buildUserMemoryNormalizationDiagnostics tests, and recordAiUsage argument-count expectation. Do not describe the full suite as green. Actual Terra cache hits remain pending.

### Dialogue time from existing created_at — 20 September 2026

User-led Terra testing found that CURRENT_TIME_CONTEXT disappeared when a current question became history. The first fix introduced redundant prompt_time_context storage; the user rejected it and it has been removed. Use existing data rather than adding duplicate persistence.

Entry and check-in consumers select the persisted USER message of the current turn and derive timeContext from its createdAt. buildDialogsPrompt derives each historical USER timeContext with the same getDialogTimeContext helper and the saved conversation timezone/locale. Backend formatDialogQuestion renders both current/history identically and removes wire metadata before provider dispatch. No new stored timestamps or metadata. Legacy messages without a timestamp remain verbatim; callers without a persisted current user retain the existing request-time fallback. Existing old clients remain supported.

A cleanup-only idempotent SQLite migration drops prompt_time_context if the temporary fix already added it; existing text and created_at are preserved. Fresh databases do not add it. Restart frontend for cleanup, then inspect exact final payloads for two new consecutive questions. Prompt instructions, billing and provider cache policies are unchanged. Payload continuity does not guarantee provider hits.

### Current Terra explicit-prefix policy — 20 September 2026

After the automatic comparison, the user requested Terra explicit caching for both initial responses and dialogues. getOpenAiPromptCacheOptions again selects explicit mode for all GPT-5.6 models. Existing common/context markers and retained completed-answer markers drive both stream/nonstream provider paths; changing tasks/questions after the last marker are ordinary input, not automatic cache writes. No prompt rewrites, frontend, credit-rate or plan changes. Qwen stays automatic.

Luna dialogue-memory explicit caching remains verified (1928 tokens reused). Initial user-memory and assistant-memory requests are still explicit without markers. Proposed initial-memory caching is under user review after the user requested independent cost/benefit judgment: local o200k_base synthetic Ukrainian-language estimate ~905 static tokens for user memory (below 1024 cache minimum), ~2012 for assistant memory. Estimates are not provider measurements. Do not pad prompts to reach cache minimum. Do not enable initial memory caching merely for consistency: it adds write cost unless the same prompt is reused.

## Terra Standard pricing — 20 September 2026

User approved replacing averaged Terra rates with current Standard short-context API rates (https://developers.openai.com/api/docs/pricing): USD 2 input, 0.20 cache read, 2.50 cache write, and 12 output per million tokens. At 10,000 credits/USD, `src/plans/types/credits.ts` now uses 20,000 / 2,000 / 25,000 / 120,000. Existing token history, legacy plans and V2 subscriptions/wallets retain the shared `tokensToCredits` calculation; historical charges are not rewritten. Frontend rates were initially synchronized; the subsequent frontend cleanup below supersedes this. Other model rates, context token limits and access rules are unchanged. This fixed tariff is for Standard short-context workloads; long-context (>272K), Fast and regional surcharges are not selected dynamically by the existing calculator.


## Frontend token budgets, backend credit ownership — 20 September 2026

The frontend no longer contains API price tables or converts token counts into credits. Removed `memoryContextCredits.ts`; `memoryContextBudget.ts` owns the shared 6,000-token memory-context ceiling used by ranked retrieval and the fallback capsule selector. The fallback no longer has a model-price-dependent 180-credit cap; explicit smaller token budgets remain supported. Consequently expensive models may receive more fallback context than under the old credit cap. This is a context-selection limit, not the complete request size or a spending estimate.

Review logs count local tokens only. Server-reported charges remain visible verbatim. Missing charges are unknown, not zero: embedding endpoints currently return token counts without charged credits, so review totals explicitly identify missing calls and incomplete coverage. No local embedding tariff is passed off as backend billing. Subscription balances, billing, legacy plans, V2 wallets, provider calls and wire contracts are unchanged.


## Sonnet 5 selection and Opus compatibility — 20 September 2026

The new frontend offers Terra, Qwen and Claude Sonnet 5. Its existing settings normalizer maps saved Opus 5 and earlier Claude selections to Sonnet 5. Opus is removed from active frontend model types/options; legacy string mappings and historical display labels remain. Existing saved response records are not rewritten. Backend keeps every Opus identifier, provider route, price and request behavior for released clients.

Added claude-sonnet-5 to the existing AiModel/Anthropic registry and shared credit table: 20,000 input / 2,000 cache read / 25,000 five-minute cache write / 100,000 output credits per million tokens (10,000 credits/USD). Source: https://platform.claude.com/docs/en/about-claude/pricing. Sonnet uses existing streaming, prompt-cache markers, response parsing, usage persistence and legacy/V2 billing. Both Claude 5 models explicitly disable adaptive thinking, retaining existing response token budgets; no new provider execution path. Sonnet migration reference: https://platform.claude.com/docs/en/models/sonnet-5/migration-guide.

Migration 1789912800000-AddClaudeSonnet5AiModel.ts adds only the new token_usage_history_aimodel_enum value, with a non-destructive down. Deploy backend/schema support before the new frontend. The migration was prepared, not executed against a database in this task (app.module currently enables synchronize; migration CLI uses synchronize:false). Local frontend token counts remain approximate; provider usage is billing authority. An explicit scalar-only type for periodic-report INSERT avoids TypeORM recursive User-relation type expansion after the enum grew, without changing persisted fields or INSERT semantics.

Reasoning settings audit: Qwen currently sends enable_thinking:false; Terra sends no reasoning_effort, so the documented medium default applies. These policies were not changed by the Sonnet addition.

## Current reasoning policy and verified prices — 20 September 2026

This section supersedes the thinking-disabled audit above for current models. Final user choice: Qwen thinking-only ceiling 1,024; other current models' user-facing responses capped at 2,048 total output. `src/ai/utils/response-reasoning.ts` owns the policy used by both streaming and non-streaming methods in the existing AiService executor; no separate prompt, provider pipeline, UI stream, or billing path was introduced.

- Qwen 3.8 Max: `enable_thinking:true`, `thinking_budget:1024`.
- Terra and Luna: explicit `reasoning_effort:medium`, previously the documented default. Luna memory calls use the same setting and keep their existing combined output limits.
- Sonnet 5: `thinking:{type:adaptive}`, `output_config:{effort:medium}`. Anthropic SDK is pinned to 0.127.0 to support these documented parameters without type suppression.
- Older model request policies, including Opus, remain compatible as previously requested.

Qwen exposes a thinking-only budget. Its shared helper adds 1,024 to the existing base response allowance: entry/check-in/dialog 3,524 total; day analysis 3,424; week/month 4,424; analysis dialogue 2,824. Terra/Luna/Sonnet use min(existing base allowance, 2,048), including both thinking and text; the existing lower 1,800 allowance for an analysis dialogue remains. These models have no separate hard thinking-only cap. Technical memory extraction keeps its existing combined limits; this cap concerns user-facing responses. These are ceilings, not prepaid charges or guaranteed allocations between thinking and answer. Existing character limits in prompts are unchanged. Periodic estimates use the same helper as dispatch. At 2,048 combined output, complex reasoning can leave too little room for text/capsule; verify actual finish reasons and completeness in user-led tests.

Internal thinking is not forwarded into user-visible streams or saved as conversation text. Provider `completion_tokens`/`output_tokens` already include thinking; those totals remain the billing authority and are not added twice. Missing provider usage remains an explicitly estimated fallback; hidden reasoning cannot be fully reconstructed from the visible answer. No paid provider or phone test was performed; real response quality, timing and cache hits still require user-led validation.

Verified Standard prices (USD per million tokens; 10,000 credits/USD):

| Model | Input | Cache read | Cache write | Output, including thinking |
| --- | ---: | ---: | ---: | ---: |
| Terra, short context | 2 | 0.20 | 2.50 | 12 |
| Luna, short context | 0.20 | 0.02 | 0.25 | 1.20 |
| Qwen, Singapore International | 2 | 0.25 automatic | 2.50 explicit | 6 |
| Sonnet 5 | 2 | 0.20 | 2.50 for 5 minutes | 10 |

Qwen uses automatic caching. Its previously configured Frankfurt price did not match the Singapore endpoint enforced by qwen-config.ts; corrected the active read/input/output rates. Explicit Qwen read pricing is a different tariff and is not enabled by this policy. Luna's old averaged price was replaced with Standard prices. Historical ledger charges, legacy plans, V2 wallets, cache boundaries and persisted context remain unchanged.

Pricing audit: all OpenAI calls explicitly request service_tier:default, all Anthropic calls service_tier:standard_only. Qwen receives no unsupported service-tier field. This prevents an account-level automatic priority selection from conflicting with Standard billing. Local configuration has no OpenAI/Anthropic custom base URL; Qwen is Singapore. Deployment-specific regional/negotiated pricing would need a separate explicit configuration; no claim of production invoice verification.

Terra/Luna requests above 272,000 total input tokens, including cache reads/writes, use the documented long-context prices for the entire request: input/read/write x2, output x1.5. The optional inputTokens parameter of getModelPriceCredits is used by the shared tokensToCredits calculator, periodic estimates and diagnostic rate logs. Existing callers without token counts retrieve the base rate. Both legacy and V2 billing consume the same calculator. Credit calculation is ceil((ordinaryInput*inputRate + cacheRead*readRate + cacheWrite*writeRate)/1M) + ceil(totalOutput*outputRate/1M); reasoning is already part of totalOutput. Input categories are disjoint. This can add less than two credits versus an unrounded API-equivalent amount per call. Illustrative 2,000 ordinary input + 1,200 total output: Terra184, Qwen112, Sonnet160, Luna19 credits. No subscriptions, credit package prices or past charges were changed.

Sources: https://www.alibabacloud.com/help/en/model-studio/qwen3-8-max; https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions; https://developers.openai.com/api/docs/models/gpt-5.6-terra; https://developers.openai.com/api/docs/models/gpt-5.6-luna; https://platform.claude.com/docs/en/about-claude/pricing; https://platform.claude.com/docs/en/build-with-claude/thinking-steering-and-cost.
# Image generation extension (23 September 2026)

Confirmed conversation image proposals use the same `AiService.executeResponse` entry point and `persistAiUsage` accounting lifecycle. See [image-generation.md](image-generation.md) for the capability gate, encrypted existing-media storage, idempotency, actual-usage billing and legacy/V2 compatibility. Ordinary response contracts remain unchanged.

## Linked journal context — 26 September 2026

Approved frontend final context assembly adds canonical entry IDs, plan IDs/occurrence days, source ENTRY_REFERENCE and included/omitted linked-entry metadata. Linked capsules share the existing memory budget and are deduplicated before the saved snapshot is sent. JOURNAL_COMMON_INSTRUCTIONS teaches all four journal/check-in modes to interpret these relations without duplicate evidence or inferred completion. Old clients need not provide these fields; existing saved snapshots are not rewritten. No socket/HTTP, model/provider, cache-boundary or billing contract changed. The stable instruction prefix changes once with this release. Frontend implementation and validation: `diary-front/docs/audits/linked-ai-context-20260926.md` from the workspace root.


## 29 September: source blocks and separate Luna daily capsule

See [capsule-blocks-20260929.md](capsule-blocks-20260929.md) for the current contracts, source timestamps and observation metrics, 850–900-token day capsule, usage types, fresh routine check-ins, and verification workflow. This supersedes the joint 900-character daily capsule described above; saved historical prompts remain unchanged.


## September 30 capsule correction batch

The approved correction batch preserves the shared executeResponse/provider/accounting lifecycle. Hypotheses remain unrestricted in number and depth but are explicitly attributed; capsules retain those explanations as hypotheses. Local timestamp rendering and daily source measurements are application-owned transformations; no new server storage or DTO fields. The 900/1000-token daily capsule budget includes deterministic observations, and the single retry/fallback policy remains. See [implementation and validation](capsule-corrections-20260930.md).
## 30 September: separate weekly capsule recovery

Current capsule output-purpose exception and recovery contract: [weekly capsule recovery](weekly-capsule-recovery-20260930.md). Main response limits/prompts are unchanged; Luna day/week capsule calls have separate reasoning headroom through the same provider and accounting lifecycle.

## Monthly capsule token threshold — 2 October 2026

After the Sep30 audit, the user approved converting the month capsule writing goal from1500 characters to1500 tokens (target1350), with a separate paid-retry threshold2000 tokens for all current plans. At or below2000 keep the first capsule; above it run one compression pass and select any valid completed second capsule even if still oversized. No third pass; failed/invalid/truncated retry preserves the first complete result. The shared Luna/provider/billing path and stored report contracts remain. Year character policy and weekly shorter-retry rule remain unchanged pending the user's subsequent proposal review for unified per-tier limits/thresholds. No saved capsules regenerated and no paid calls made.

## Annual evidence and December29–31 window — 2 October 2026

Annual context now keeps every supplied valid current-year monthly capsule and at most one existing immediately preceding calendar-year capsule, without rejecting or trimming at the plan context guide. Estimates and execution share selection; usage is actual. Annual context-capacity disallows generic history backfill, preventing older clients from initiating historical-year recovery. Current-year missing months still use the shared capsule-only recovery path. Annual result capsule generation remains unchanged.

Early annual generation is allowed December29–31 in the request timezone with asOf in the same window. Full-year storage bounds remain. Recovery/month-fragment routes permit an open year-end source period while normal visible monthly generation retains its closing-date rule. Frontend recovery excludes source days after asOf; annual task explicitly describes a still-open year through cutoff. Frontend completion/report lookup hides Today offers across all three days after one successful visible annual report. See ../diary-front/docs/year-analysis-20261002.md for tests and prompt rollback fragment.



## Sonnet 5.5 replacement — 3 October 2026

Current settings offer Terra, Qwen and Claude Sonnet 5.5 (`claude-sonnet-5-5`). The existing frontend settings normalizer and backend `normalizeAiModel` upgrade saved Sonnet 5 selections for new requests, including conversations and periodic summaries that read server settings. Historical Sonnet 5 enum values, prices and usage rows remain intact; older model IDs remain accepted. Other legacy Claude routes are unchanged.

Reuses Anthropic streaming/nonstreaming execution, cache markers and actual-usage billing. Adaptive thinking stays at medium effort; no temperature, explicit thinking budget, tools or assistant prefill are added. User-facing answers use the required 128,000-token provider maximum with existing prompt length guides, not a new tariff cutoff. Media uses the same documented 1M context / 600 image / 32 MiB request policy and 28-pixel image patches.

Rates per million tokens: 20,000 fresh input / 2,000 cache read / 25,000 five-minute cache write / 100,000 output credits. Official references checked 2026-10-03: https://platform.claude.com/docs/en/models/sonnet-5-5/overview and https://platform.claude.com/docs/en/models/sonnet-5-5/migration-guide . No SDK update or prompt changes required.

Additive migration `1791046800000-AddClaudeSonnet55AiModel.ts` enables usage persistence before production rollout; rollback keeps model values for historical rows. Local development schema was verified to already contain the new enum (existing TypeORM synchronization). No manual database mutation, server restart or paid provider request was performed.

Validation: 132 backend tests across provider routing/streaming, cache billing, media, response limits and settings; 30 frontend model/settings tests. Backend typecheck still reports the pre-existing TS2589 at image-generation.service.ts:109. Frontend typecheck, scoped backend/frontend ESLint and diff-check pass. Live provider response and phone acceptance remain unverified.


## Image creation across response surfaces — 3 October 2026

User approved the existing confirmed image action in first entry/check-in responses, standalone conversations, and day/week/month/year summaries and all follow-ups. The same `IMAGE_GENERATION_INSTRUCTIONS` block is used everywhere; it explicitly describes the app capability independently of the selected text model. Structured responses place the fenced `nemory-image` proposal inside `fullText` or summary `text`, never outside the required JSON. Only current explicit requests may create proposals; source history must not replay old requests. Price is shown by the existing action, and a button press is still required before the paid image endpoint.

Current frontend `runAIStream` advertises `imageGenerationSupported:true`; backend DTOs/gateway pass it through and the existing environment flag must also be enabled. Older clients default to false. Conversation and main period prompts now include the capability. Old period follow-ups retain their stored prefix and add the shared capability once. Existing auxiliary capsule/model extraction paths are unchanged.

Frontend reuses `ImageGenerationAction` and private image files. Dialogue images keep `dialogs.attachments`; first responses use their real `ai_comments.id` with existing `entry_images` and a deterministic image ID. Period main answers use the report UUID, follow-ups the turn UUID (not the display-only `-answer` suffix); generated references and files live in existing report JSON. Report saves merge generated media to avoid losing it when a dialogue/capsule completes. Local-first recovery avoids network/paid work for saved images. Editing preserves first-response media, explicit library deletion strips its old proposal, and period deletion already cleans the shared mediaFiles. No table/migration added.

Changed anchors: backend response-system-prompt, image-generation.policy, conversation DTO/service, periodic DTO/service/controller and gateway; frontend runAIStream, periodic types/repo/reading, shared EntryDialogMessage/EntryConversation, AiReflectionText/EntryReflection and active consumers, dialog-media.service, ResponseImageGeneration and ImageGenerationAction. `image-generation.service` now inserts only persisted scalar/JSON fields, fixing TS2589 without removing the atomic duplicate claim.

Validation: targeted backend prompt/conversation/period/image/billing tests; frontend action, persistence, report merge, response identifiers, socket capabilities and reflection tests. Both typechecks pass. No paid provider calls, real user-data mutation, server restart or new device visual acceptance during implementation. A real image remains user-confirmed via its estimate button.
# Exact app UI labels — 7 November 2026

## Planner creation v2 — 8 November 2026

New clients advertise `plannerCreationVersion:2` alongside the existing capability boolean on every response/extraction surface. Main prompts summarize supported native-form parameters; the shared capsule/action extractor receives the full v2 contract. Old clients retain v1. The canonical backend validator is copied to the frontend with `node scripts/sync-planner-contract.cjs`; `--check` detects drift. Invalid or incomplete v2 batches produce `plannerCreationError`, never silently stripped settings or duplicate legacy scheduled reminders.

The frontend v2 executor uses existing save transactions, notifications, ownership guards and receipts. A retry reconciles notifications on the already persisted ID without overwriting edits. Creation telemetry is sent after persistence, even when OS notification setup later fails. Audio references must match the consent-checked source/account/vault allowlist and are copied into note-owned storage. No new tables or UI fields; no modification/deletion/cancellation actions. Full parameter map, protected psychological instructions, token matrix and acceptance limits: [planner contract handoff](prompt-history/20261108-planner-contract/README.uk.md).

## Localized labels

Shared capabilities receive `uiLocale` from the authenticated user's current `settings.lang`, independently of `conversationLanguage`. Journal/check-in/dialog, standalone conversation, periodic generation and saved-period follow-ups all use this path. Follow-ups refresh recognized shared blocks at request time; historical answers and saved reports are not rewritten. Unsupported/missing locales fall back to English, matching the app; regional codes select their base language.

`src/ai/utils/nemory-ui-labels.generated.ts` is a deployment-contained projection of 17 actual navigation/action/series keys from `diary-front/locales/{de,en,pl,uk}/translation.json`. It is generated, not separately translated. Run `npm run sync:ai-ui-labels` after changing those frontend strings, and `npm run check:ai-ui-labels` to check parity in the combined workspace. Runtime needs no frontend checkout. The generator includes every available frontend catalog and rejects missing/non-static values.

Only the selected UI locale enters the shared capabilities prompt; exact labels replace English examples rather than adding a bilingual glossary. The existing response-language policy still controls prose. Compact technical capability/image-format descriptions retain create-only consent, old-client gates, image reference/confirmation contracts and all protected psychological paragraphs. The four-locale instruction matrix covers entry/check-in/dialog/conversation/all summaries with web, images, planner creation, Qwen language reminder and a conservative UUID allowance; maximum 3000 o200k tokens for the fixed fixture. User-specific context, names and provider framing are not a fixed universal total. Native R04 localization acceptance remains pending; no paid model replay performed.

### Planner audit corrections (2026-11-08)

V2 extraction accepts bounded `plannerContext` (source + ordered source-specific turns + actual local receipts). It supplies clarification evidence, not replay authorization. Standalone conversations never gain diary access. `plannerCreationQuestion` reaches the existing service-result block and the next outbound model context; source messages/reports remain unchanged.

The existing encrypted `planner_action_receipts` table has lazily migrated `commands_json` and `feedback_json` columns. Commands freeze before any save; retries retain child identities and reconcile persisted settings. Partially saved items are recorded before notification scheduling. Successful receipts clear copied commands/feedback but retain status/identities. Only explicit retry invokes the local executor; render/remount cannot replay.

Creation location hints use native Today hidden/category filters and Calendar categories. Live planning context now exposes all habit execution windows and stored goal/habit/task/event notification settings (no OS identifiers). The frontend uses the native recurrence-overlap/date checks; v2 schema enforces task-description and custom-unit/count limits.

Conversation and period response/action extraction share request trace IDs. Version 2 leaves a successful response/capsule usage cycle open until Luna settles; legacy lifecycle is unchanged, incomplete responses close without actions. This changes diagnostics, not charging authorities. The offline instruction matrix now has 216 cases, maximum 2990 o200k tokens; arbitrary profile/history/media and Luna are separate input, not a universal full-request limit. See the audit handoff for validation and pending built-app acceptance.

## R01.1: explicit weekday encoding — 10 November 2026

Live entry-dialog trace `dialog-bb8760de-3e10-4308-8d2c-534eb7aec5ee` rejected `/plannerCreations/0/weekdays` with `WEEKDAYS_REQUIRE_DAILY`, supplied1/accepted0. This establishes incompatible frequency plus weekday selection; the exact raw frequency was not retained in this diagnostic. Phone read-only evidence found no matching reminder and an error receipt without entity refs. No partial planner was created.

Replace only the V2 extraction Series clause:
- Before: `daily days (Mon=1): task/event/reminder weekdays?:[1..7]; habit uses habit.daysOfWeek.`
- After: `task/event/reminder: selected weekdays→frequency:"daily",weekdays:[1..7](Mon=1); weekly/monthly/yearly omit weekdays. Habit uses habit.daysOfWeek.`

This is a general schema rule for task/event/reminder; habit rules remain separate. No normalization heuristic silently changes invalid commands. The validator, main prompt, psychology, usefulness and practical steps are unchanged. Expanded Luna planner block1348→1361 o200k_base tokens (with weekly interval capability1367→1380); main instruction maximum from unchanged tested matrix remains2997, not remeasured in this fix.

Automated:109 unique backend tests pass across extraction adapters, planner V2 validation/diagnostics and protected psychological blocks. Mocked provider cases cover selected Tue/Thu/Sat reminders with full parameters and ordinary weekly reminders; all3 adapters deliver the updated instruction and preserve outputs. Invalid weekday fields on weekly/monthly/yearly remain rejected for task/event/reminder. Fixed a stale test-only semicolon expectation left by the earlier approved main-prompt compaction. Backend TypeScript and scoped ESLint pass. Tests do not establish live Luna compliance. No current planners were mutated and no paid AI requests were made by the assistant. R01.1 real retry pending, with a future first notification time.

## G01.1 audio context transport — 10 November 2026

Implemented without instruction/prompt edits or existing-device data changes. The audio-only dialogue guard returned an empty extraction before Luna because userText was empty. The first main answer had already received consent-checked media.

The shared frontend runAIStream now snapshots the prepared audio IDs and ordered history into the existing account/vault-scoped audio-reference module, keyed by the extraction trace (conversation requestId, otherwise timingTraceId). Both extraction API adapters forward optional audioContext. History remains history; the current voice message is separate. References are recreated by existing media preparation/replay on later clarification requests, so no transcript table or plaintext transcript storage was added. Non-audio/generated media are excluded. Context-size overflow rejects instead of dropping original speech.

Both backend extraction adapters enrich data before their empty-text guard. MediaAnalysisService reads ready audio transcripts from the existing encrypted asset cache with user ownership checks. It performs no transcription, charging, payload write or retention extension. Missing/foreign/unready/non-audio assets fail closed with a diagnostic code. Current speech extends userText; ordered historical speech extends the existing planner-history data, preserving earlier requests and subsequent clarifications. Existing prompt constants and psychological/usefulness instructions are untouched; legacy requests without audioContext remain compatible.

25 November 2026 — `ready` represents completed media processing, including a transcription call that returns no recognized speech. New results persist an explicit empty string in that case. Extraction skips blank or absent transcripts on owned, ready audio so the existing text can still produce capsules. A prepared audio asset without audio bytes fails before any paid work. The ownership and readiness checks still apply to every referenced asset.

Validation: 55 backend tests PASS (three real extraction adapters with mocked provider, first audio request, audio/text clarification, DTO whitelist, foreign/missing/unready assets, no paid fallback/storage writes); 70 unique frontend tests PASS (request IDs, conversation/entry/period media preparation, transport, trace/account/vault isolation, existing execution lifecycle). Initial Jest attempts failed on sandbox temp cache EPERM, then succeeded with workspace cache. One stale stream test expected no eventWeeklyIntervalSupported; corrected the test expectation to the pre-existing capability. TypeScript front/back PASS; frontend ESLint0errors with two existing warnings in runAIStream. New backend files and changed implementation have no lint diagnostics after formatting; the wider scoped lint retains18pre-existing prettier errors in untouched DTO decorators and older media-analysis tests. Scoped diff-check PASS. No paid provider calls by assistant.

Manual G01.1 remains pending audio retry,39/63passed24remaining. Existing unsuccessful goal request created no planner. Do not count the mocked extraction as actual model/phone acceptance. Evidence: front/.tmp/g011-audio-tests-local.log, g011-audio-transport-tests.log, g011-audio-types.log; back/.tmp/g011-audio-tests-local.log, g011-audio-types.log. Next: user repeats G01.1 with audio and any needed clarifications; verify one goal, three stages, exact dates, reminders/visibility/appearance, cycle tokens/credits including Luna.


## G01.1 named colors and icons — 10 November 2026

User correction: speech/text color and icon names suffice; do not require HEX or pasted emoji. Backend-only V2 rule for every planner kind/locale. Main capabilities before `color/icon.` and `Clarify essentials/conflicts/unsupported only:`; after `color/icon names suffice.` and `Clarify essentials/conflicts/unsupported,never HEX/emoji:`. Equivalent compaction: `Exact UI labels;planner/entry suggestions:no pressure/duplicates.` → `Exact UI labels;suggestions:no pressure/duplicates.`

Luna before: `Omit appearance unless requested; null means theme/default.` After: `Appearance only if requested; null=theme/default. Named colors/icons→matching HEX/emoji:choose shade/symbol,never ask codes/emoji;preserve explicit values.` Existing schema accepts HEX colors and icon strings. Model selects a fitting shade/emoji from its knowledge, not from an injected app catalog. Explicit HEX/emoji remains exact; absent appearance stays omitted/default. IconGlyph maps Unicode to bundled Fluent art if available, else system emoji; no new assets/network/icon-picker feature.

Final main instructions +3tokens vs prior state, maximum3000 across36 locale/mode combinations; Luna +24tokens. Psychology/usefulness blocks unchanged byte for byte.40testsPASS (19rules/real extraction adapters with mocked provider for named colors/icons, explicit values/default omission;21prompt-budget/psychology tests). Initial3failures were a test's trailing-space expectation against existing trim, corrected in fixture; no parsing change. Frontend/data untouched. Actual model compliance remains pending G01.1 continuation in the same dialogue with a plain named color/icon. No paid provider calls made by assistant. Evidence:.tmp/g011-appearance-tests.log;planner-named-colors.spec.ts.

## Planner changes through chat

Updated clients advertise both plannerChangesSupported and plannerChatActions. The latter selects the direct-action instructions and extraction protocol v2. Old clients keep their confirmation flow. The local executor matches current records and recurrence scope, asks for clarification as chat text when necessary, and prohibits deleting planners. A successful edit and its reversible local SQL changes share one transaction with the completion receipt. Undo looks up recent changes in the originating chat or entry thread, checks for conflicts with newer writes, and reconciles notifications. The journal expires after 48 hours. Ordinary conversation messages follow their existing retention policy.
## Structured journal planner actions — 12 November 2026

For short/full entry and check-in responses with chat planner actions enabled, the JSON contract requires `plannerAction` (`none`, `create`, or `change`). The backend binds an action to one fresh receipt key in both response fields. Only ordinary reflections stream their two-version content; actions reach the app on finalization. A complete response without a valid discriminator is rejected. An action classification routes the request to Luna and does not authorize a write: the executor still checks the current user request, target and saved items. Plain-text and legacy client contracts retain their existing markers.
