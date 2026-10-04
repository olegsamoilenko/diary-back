# Source capsules and daily compression — 29 September 2026

Fresh September 7 rerun and follow-up metric correction: see `day7-rerun-audit-20260929.md`. Current AI payloads use compact named metric strings; code owns exact dated mood/score metadata, and source extraction is instructed not to repeat it in prose. The rerun exposed overbudget day-capsule rejection, source-time rendering errors and incomplete check-in trace correlation; these are not resolved by metric formatting.

User-approved behavior implemented on top of `AiService.executeResponse` and the existing V2 capsule fields. The previous 600-character user digest and durable-only reflection extraction no longer describe the active entry/check-in details flow.

## Source evidence

- `extractUserMemoryDetailsV2` and `extractAssistantMemoryCapsuleV2` explicitly use GPT 5.6 Luna. User-facing answers continue using the selected model. Existing long-term `userMemory`, commitments, reminders and response contracts remain separate.
- `userDigest` holds meaningful blocks: concrete events/people, actions, reported feelings, consequences, intentions, promises, unresolved questions. The response's `assistantMemory` preserves distinct explanations and concrete suggested steps, including useful one-off advice. AI hypotheses are attributed, not promoted to facts or accepted plans.
- Source timestamps are supplied independently of request/reminder time. Relative dates use the source date. Exact supplied mood and named/scaled measurements are attached to the user capsule as a source observation, independently of model omission. They represent the state at that entry/check-in; there is no invented daily mood or daily measurement.
- Morning and before-sleep check-ins have **no new Luna call and no user-facing analysis**. Their original Q&A, source time, mood and metrics remain available as evidence.

## Daily analysis and capsule

The selected model now returns `{text}` for a new daily report. After the answer has streamed and been saved, Luna receives the exact source payload from that request, including dates, snapshot and prior-history background, plus the user-facing answer as attributed interpretation. Main-model system/style instructions are replaced with the compression task. Week/month initial response contracts and old saved prompts remain compatible.

The approved target is **900 tokens**, accepted maximum **1000**. A complete shorter capsule is accepted; the prompt discourages padding and generic summaries. Actual text is counted with the configured Luna tokenizer. An oversized first capsule triggers exactly one compression call containing only that capsule: `ceil((1 - 900 / measuredTokens) * 100)` percent reduction, e.g. 1362 → 34%. The retry preserves dates/facts/measurements/attribution and is measured again. Only a complete nonempty result at or below 1000 replaces the first capsule. A failed, malformed, truncated or still-oversized retry preserves the original with status `over_budget`; an unusable first output remains `failed`. No clipping or unbounded retries. This supersedes the earlier 850–900 rejection policy.

Both passes use executeResponse with type `daily_capsule`, distinct operations `generate_daily_analysis_capsule` / `compress_daily_analysis_capsule`, and the same trace. Metadata includes attempts, originalTokens, reductionPercent, selected tokens and total known capsule credits. Maximum estimate reserves one conditional retry; billing charges executed calls only. Diagnostic usage-cycle completion happens once in finally. Logs include extracted/compression_requested/compressed/compression_failed/saved stages. The result is returned for existing local report persistence, never stored in a backend report archive. Sequential processing is not a durable background queue: process death or loss of the final response can still interrupt delivery.

User explicitly requested both versions for quality comparison: `capsule.day.comparison` is appended to the existing `.tmp/context-audit-YYYY-MM-DD.jsonl` and `.md`, and printed in development console as `NEMORY_DAILY_CAPSULE_COMPARISON`. It contains the complete first/second capsule, measured tokens, requested/actual token reduction percentage, each pass's usage/credits, selected pass and final status. Invalid output is retained as rawResponse for diagnosis. A skipped second pass is null. Token reduction is not a semantic quality score; semanticPreservation explicitly remains unverified until the texts are compared. No extra evaluator-model call or parallel file store.

Validation of this follow-up: 68 backend tests across periodic service/provider and shared legacy/V2 billing plus 11 frontend service tests passed. The 27 service tests were rerun after the comparison-log change and verify both complete texts, token/percentage accounting and selected pass. TypeScript, scoped ESLint and whitespace checks passed. No real provider calls, seed reruns, deployment or phone verification. Nemory paid usage for implementation/testing: zero; Codex fresh/cached/output telemetry is unavailable, no account-cost estimate inferred.

Usage history now distinguishes `daily_analysis`, `weekly_analysis`, `monthly_analysis`, `yearly_analysis`; the annual name is reserved, it does not add an annual feature. Daily compression uses `assistant_memory` with operation `generate_daily_analysis_capsule`. The enum migration reclassifies existing report rows by matching owner and report trace, without modifying token/credit amounts. Admin charts accept the additional types. No database was dropped or migrated manually during this change.

This change prepares richer daily capsules for weekly work; it does not switch the existing weekly snapshot collector to a capsule-only hierarchy.

## Fresh routine check-ins in entry/check-in context

The active semantic retrieval flow includes original morning/evening check-ins from the source's local calendar day and the two preceding days, never later than the source timestamp. The current source is excluded. These are explicitly named `Ранковий чекін / Morning check-in` and `Вечірній чекін / Evening check-in`.

They precede ordinary relevance candidates within the existing shared token budget. Selection deduplicates by entry ID, and preserves the priority during planner linking and saved-context rebudgeting. Other historical retrieval remains unchanged. If the required originals alone cannot fit, `RECENT_CHECKINS_CONTEXT_LIMIT` fails explicitly rather than silently dropping evidence or exceeding the budget. No extra AI compression of these check-ins is performed.

## Phone comparison run

The user will clear the test data and launch September 7, 8 and 9 sequentially on the phone. Their authored journal bodies now contain approximately 1000 characters each (991, 966, 1003 excluding HTML, with paragraph separators). Existing story, times and planner IDs are retained. No paid seeds were run by the assistant.

Development-only `context-audit-YYYY-MM-DD.jsonl` / `.md` files in each repo's `.tmp` preserve:

- backend `capsule.user.extracted` and `capsule.assistant.extracted`: original, source time, normalized capsule, Luna model;
- backend `provider.messages.prepared`: exact context delivered to the model;
- backend `capsule.day.extracted` / `capsule.day.failed`: period metadata, capsule, actual token count and sparse justification/failure;
- frontend `daily_scenario.reflection_saved` / `checkin_saved` / `analysis_saved`: persisted original, capsule, context and results.

Compare chronology, checklist item versus parent completion, suggestions versus accepted actions, all observed mood/metrics, and duplicate source IDs. Synthetic tests establish wiring and boundaries, not real-model extraction quality; assess quality from the next phone logs.

## Validation and handoff

- Backend: periodic service/provider/gateway and shared billing checks passed; source evidence tests and seven focused extraction/commitment checks passed. A final case covers pending report state during Luna compression to prevent concurrent dialog overwrite.
- Frontend: 57 focused preparation/retrieval/context/link tests passed, plus 21 shared budget-builder tests and 4 seed-link tests. Three-day boundaries, future exclusion, DST, exact labels, measured state, deduplication and restored-context priority are covered.
- TypeScript passed in diary-back, diary-front and diary-landing. Scoped ESLint passed with existing frontend i18n/admin effect warnings; changed diffs have no whitespace errors.
- The broad older memory-capsule suite also exposed unrelated existing diagnostics-method and usage-mock-signature failures. Those legacy test harness issues were not rewritten as part of this change; focused changed extraction contracts passed.
- No real provider generation, database clearing, manual migration execution or phone interaction. Real-model quality and final phone behavior remain for the user's fresh seed run. Per-task Codex fresh/cached/output token usage is not exposed here; no API-equivalent cost is asserted.

Reports stay pending while the already saved main text is being supplemented with a daily capsule, and complete after auxiliary success or handled failure. An interrupted process may leave a pending report for inspection; there is no automatic paid retry.
