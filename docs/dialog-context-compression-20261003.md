# Dialogue context compression before answering

Approved 3 October 2026. Same policy for entry/check-in followups, Conversation and day/week/month/year followups. This does not replace long-term user/Nemory memory or period capsules.

## Policy

- Trigger above 12,000/18,000/24,000 o200k tokens for Lite/Base/Pro. Count prior dialogue memory plus subsequent dialogue text, excluding the original entry/analysis/base context and the new question.
- Retain the last four complete pairs verbatim. If these alone exceed the threshold, retain fewer, at least the last pair. Never split a pair. Old media-bearing turns are retained from the first such turn onward: text-only compaction must not silently erase visual/audio evidence. This can prevent compaction when media starts the history; a multimodal compaction policy is not implemented here.
- One Luna request BEFORE the main response, with a prompt guide of 25% of the actual compressible source (old capsule plus newly aged turns). No small output cutoff. No second pass for target overage. Accept nonempty, completed output only when shorter than its source; otherwise retain existing context. Network/unknown outcome stops the main request rather than silently replaying paid compression. User retry is explicit.
- No action/reminder/long-term-memory extraction from this transport capsule. Preserve user corrections, decisions, emotions, outcomes, unresolved issues and attribution of Nemory hypotheses; do not invent the ending of partial responses.

## Existing storage and flows

`runAIStream` invokes shared `prepareDialogContext` before media preparation/socket dispatch for all three dialogue endpoints. New text-only endpoint `/ai/dialog-context/compress` uses JwtAuthGuard, PlanGuard, AiCreditCycleId/claimExecution, SubscriptionUsageService and AiService.executeResponse. Usage is `dialog_capsule` with operation `compress_dialog_context`; no new database token enum. The server resolves the effective tier independently. HTTP parser reuses the period endpoint's 1 MB policy. Abort propagates to provider work; completed capsule saves before the main response begins.

Device storage: `entries.prompt_json.dialogContext` for entries/checkins/conversations; `AnalysisReport.dialogContext` in existing local report JSON for periods. Version, text, covered-unit count, source SHA256, actual/target/source token counts are stored. Hash validation prevents stale reuse after edits. Context refresh preserves the independent dialogue checkpoint. All original messages and attachment references remain intact; wire history is reduced only, and periodic response history is merged back before normal persistence/action processing.

Current Conversation clients send `completeHistory` and no longer slice to60 turns or use the old6000/9000/12000 selection. Older clients retain their existing server contract. Stable conversation time is the first question's timestamp, while the current question retains its actual time. Initial entry/period context remains unchanged by compression. The old periodic100,000-character dialogue rejection was removed; technical provider/transport limits still apply.

## Cache and reopening

Provider cache and persistent dialogue capsule are different. The unchanged prefix remains eligible for cache reuse; compressed history is new input the first time, with growing-cache endpoints reused on later turns. No warm-up request. A Luna call does not warm another model's cache. A provider hit or cache lifetime is not guaranteed.

Capsules survive application restarts and days-long gaps. Elapsed time does not trigger recompression. Entry/check-in base context retains its existing30-minute refresh, independently of the dialogue capsule; current question time remains current. After cache expiry the same saved text is still sent, potentially billed as fresh input.

## Loader and validation

Existing InkDropLoaderCapsule has a compression caption and a hint that it can take several minutes, on its existing background. The same timer continues through compression/media/response. Four locales. No new input or loader design.

Mocked backend tests cover tier boundaries,25% source target, single paid dispatch, ownership/duplicate/cancel guards, incomplete and unhelpful output, legacy/new Conversation contracts, cache prefix stability and periodic lifecycle. Frontend tests cover normalization, second compression, raw history retention, persistence before sending, edited source invalidation, returning three days later, metadata/media retention, account change, network failure, loader timing and source-context refresh. Full frontend TypeScript and scoped lint pass. Backend full TypeScript reports the existing TS2589 in image-generation.service.ts109; focused compiled suites pass. No real provider call, phone visual acceptance or service restart performed.

API usage for this implementation: fresh input0, cached input0, output0, credits0. Actual compression quality, reduction and cache hits require a subsequent user-run long conversation. Keep tests and handoff separate from on-phone acceptance.

## Manual test preparation — 3 October

`diary-front/components/settings/debug/DialogCompressionSeed.tsx` is mounted first in the existing Debug Put tab. Its explicit action creates a new synthetic conversation through the existing entry/settings/dialog repositories in one transaction, with account checks and duplicate-click protection. No AI, embeddings, reminders or model-created actions run during seeding. Existing conversations remain unchanged.

`db/seeds/debug/dialogCompressionScenario.ts` uses existing synthetic September scenario text, scripted answers and explicit recollections for load. This is a compression/transport fixture, not a representative response-quality benchmark. Early probes cover corrected duration, a planned action, a rejected hypothesis and mixed feelings. The actual shared history serialization and o200k tokenizer set the initial history 80–140 tokens below the active tier threshold. A manual first question/answer crosses the threshold; the next question compresses, and a third checks reuse of the changed prefix. Later reopen tests persistent capsule reuse independently of expired provider cache.

On the connected Lite device, a single conversation `Тест стискання · 11913/12000` was created and read back: 24 pairs, 48 messages, 11,913 tokens, no dialogContext capsule. The runtime guard avoided a duplicate when checking readback. A reusable button is available after Reload. At preparation time, the device's loaded runAIStream dependency map did not contain prepareDialogContext, so Reload is required before a paid test. Metro/backend were not restarted. The actual compression request remains for the user to send.

Validation: real-o200k boundary tests passed for12k/18k/24k; frontend TypeScript, scoped ESLint and diff checks passed. Seed API usage: fresh0/cached0/output0, credits0. Device readback is verified; loader, model output and provider cache hits are not yet tested live.

First manual turn diagnosis: backend provider audit at 11:43–11:44 UTC showed only2/24pairs and an explicit22-turn omission notice; usage3840fresh/0cached/1202output. The phone was still running the old runAIStream dependency map, so completeHistory was absent and the legacy server budget trimmed history. This was not capsule compression. A JS-only DevSettings Reload (no Metro/backend restart) loaded prepareDialogContext and incompleteResponse, confirmed from live dependency names. Read-only planning after reload:50messages/25pairs,12568o200k total; original24 still11913; no capsule; next turn requires compression of21pairs/10458tokens, retaining4pairs/2110tokens. No paid replay was made. User can now send the second probe in the same conversation; actual compression/cache behavior is still pending.

## Initial playback stutter — follow-up

During the long-conversation test the user reported jerky initial typing that settles later. ConversationContent.push created a new playback state on every incoming chunk; unlike PeriodicAnalysisBlock's existing first-chunk guard, it rerendered all saved messages during delivery. A regression test reproduced40 additional history renders for40 chunks. ConversationContent now uses that same first-chunk transition and continues delivering every chunk through the existing emitter/buffer. Shared EntryConversation is memoized by its immutable dialogs reference, with normal theme/context updates preserved. No typing-speed, provider, prompt, compression or UI changes.

ConversationContent and StreamingText tests:21passed, including delivery of every chunk, completion and cancellation. Actual phone smoothness is pending; no paid replay or service restart was performed for this fix. The render amplification is proven, but this does not exclude provider/network pauses in other streams.
# Entry fixture — 2026-10-03 follow-up

- Added `seedDialogCompression("entry")` alongside the existing Conversation fixture. Uses the same authored scenario, normal entry/analysis/dialog repositories, an atomic transaction, and a frozen source context. No embeddings or paid AI requests. Original text and initial analysis explicitly identify the synthetic fixture. This tests dialogue transport/compression, not retrieval relevance.
- Counts the actual `buildDialogsPrompt` Q/A messages with per-question time context. Fresh message timestamps keep the fixture within the normal 30-minute context lifetime when tested promptly. The entry fixture starts above the threshold so its first manual question triggers compression; the Conversation fixture still starts below it.
- Created phone entry `0362decb-d736-4eb9-8434-9ac8e6570f37`, title `Запис · тест стискання · 12559/12000`: 24 pairs / 48 messages. Immediate database readback counted the same 12,559 o200k tokens. No compression or response API call was made.
- Verification: 6 real-tokenizer fixture tests (all three tiers, both transports) passed; frontend TypeScript passed. The initial extra runtime-readiness assertion used an incorrect module path; corrected to `utils/diary/socket/runAIStream.ts`. The phone then disconnected from Metro's debugger, so the final readiness assertion was not rerun. Do not recreate the entry: it is already persisted. Resume by reading this ID, not invoking a new seed after reload.
- Next: user sends the first fixture question in this entry; inspect compression, retained four pairs, initial entry/analysis context, billing and subsequent cached dialogue. No restart was performed.

## Entry live compression audit — 3 October, 12:42–12:46 UTC

Read-only audit of the user's next manual request confirmed the shared entry path: source 10,441 o200k tokens (20 pairs), target 2,610, completed Luna capsule 4,451 tokens (42.6% rather than 25%, 2.35x reduction). Main provider prompt actually contains that capsule once, the last four complete pairs, original entry and initial analysis. Capsule with wrapper 4,477; four pairs' message text 2,069; shared system 2,393 plus task instructions 607; source entry 200, initial analysis 154, time context 89, new question 117. Sum of message text 10,106 o200k; provider reported 10,486 Qwen input tokens, zero cached. Do not compare these different tokenizers as identical counts. The static Qwen token-breakdown estimator overstates this prompt; the independent o200k count and provider usage are the comparison sources here.

Compression trace `8653cf05-7f4d-4e09-80f8-179995014b61`: 10,679 input, 4,537 output including 77 reasoning, 77 credits. Main entry-dialog trace `dialog-37b6d68a-4d03-4d3c-aec5-99b21192e19e`: 10,486 input, 1,256 output including 618 reasoning, 286 credits. Post-response extraction `extract_dialog_memory_capsule_v2` is a separate existing memory operation, not recompression: 3,824 input (2,619 cache-write), 1,001 output, 22 credits. Total cycle 385 credits. No paid replay, data mutation, prompt change or service restart for the audit.

Early semantic probes survived (corrected duration, physical reason for declined route, unsent planned drawing). Response mechanism is overly certain and its closing count of two restrained impulses is not securely established as two distinct events. Compression output retains long narrative paragraphs for individual episodes; current prompt says approximately 25% but accepts any completed shorter output. Suggested next work, not applied: reformulate compression instructions to use compact phrases and group duplicate explanations while preserving distinct facts and corrections; retain single-pass/no-truncation policy. Debugger was unavailable for a new local readback, but server provider-message audit verifies the capsule was delivered correctly.

## Daily-summary dialogue fixture — 3 October

User requested testing day-summary dialogues next. Extended the existing debug seed with `seedDailyAnalysisDialogCompression`; uses `saveAnalysisReport`, normal day route and shared preflight. Refuses a date with a completed summary or pending generation. On the connected account today was empty. Current backend common/day prompt builders and current device style preferences supply the frozen system prompt; no provider call. Synthetic source/summary are explicit. Seeded discussion is marked through its last dialog ID in brief memory, so later action extraction processes only the new real turn. No period capsule is fabricated.

Saved day `2026-10-03`, report `3c669c40-d2e2-4425-871a-ca3a3115d0a6`: 25 pairs, 12,122 o200k, no dialogContext. Immediate local report readback matches. Active phone runAIStream imports shared prepareDialogContext. Plan: compress21pairs/10,458tokens, retain4pairs/1,664tokens. Nine real-tokenizer fixture tests (three transports/three tiers), frontend TypeScript, scoped lint and scoped diff check passed. Preparation API fresh0/cached0/output0/credits0; actual compression and response are for the user's manual send. No restarts, runtime prompt-policy changes or edits to other summaries.

Next: first manual question probes corrected walk duration, Marta's physical reason and the unsent drawing, then asks to explain the impulse around Ira's accepted file. Audit the actual capsule, original summary/context preservation, restored full on-screen history and subsequent cache reuse. Reuse the saved report ID; do not seed again.

## Day dialogue live result and composer fix — 3 October, 13:03 UTC

Actual test compressed 21pairs/10,458o200k to3,934 (target2,615;37.6%); Luna finished normally in32.383s. The main prompt preserved source snapshot, original summary, capsule once and4raw pairs. Qwen usage9,724input/2,048cached/1,409output (777reasoning); main call34.580s. Costs: compression71 + response244 + action/brief extraction10 =325credits. Phone readback confirms26full pairs retained, checkpointcoveredUnits21/source10458/target2615/tokens3934, original prompt/summary intact, briefMemoryThroughDialogId points to the new answer, no immediate recompression needed. Three early semantic probes passed; history comparison to prior actual mouse-taking was grounded. Psychological cause was too categorical despite the explicit unconfirmed-hypothesis note. Prompt unchanged; next test is reuse/cache.

User requested loader wording: shared compressionHint is now Ukrainian “Це може зайняти якийсь час.” with corresponding neutral-time wording in English, Polish and German. Four JSON files parse; scoped diff check passes.

User reported composer not clearing. Shared ChatInput treated media capability as an actual attachment and delayed text clearing until the send promise resolved (including compression, response, auxiliary extraction and visible playback). Text-only sends now clear immediately even with media enabled; explicit preflight rejection restores the draft, exceptions use existing restoreDraftOnError. Actual attachments still wait for persistence acceptance; success does not erase a newly typed draft. Four regression cases added. Combined ChatInput/PeriodicAnalysisContent run:47passed,1unrelated existing typography expectation failed (lineHeight22 expected, actual21); scoped lint/diff pass. No paid verification call or restart. Native visual behavior of next send pending.

