# Shared AI response pipeline

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
