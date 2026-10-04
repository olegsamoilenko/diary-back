# Growing conversation and periodic-dialog caches — 2026-10-01

User request: standalone conversations should reuse an expanding history prefix like entry/check-in dialogues; separately verify periodic dialogues.

## Audit and implementation

- Journal `AiService.generateComment` already retained its context boundary plus the two latest completed assistant endpoints. This is now the shared `getGrowingPromptCacheMessageIndexes` helper in `utils/openai-prompt-cache.ts`; journal behavior is preserved by its existing continuity tests.
- Conversation previously marked only the system prefix. Mutable commitments/reminders and omission counts preceded its history. It now orders system → selected complete historical QA pairs → omission notice → current shared actions → current dated question. Actions still have reserved budget and are never displaced by history. Historical questions use the same whitespace normalization and timestamp serialization as current questions. The shared helper marks completed history endpoints.
- Periodic `responseRequest` previously used only `messageIndexes: [1]`. All four summary types now keep this original context boundary and progressively mark the two latest assistant endpoints. Active commitments follow the immutable history. Current time is part of the dated user question, replayed with its original timestamp; it is no longer a mutable system message (Claude hoists system messages ahead of history). Legacy role/capability/output overrides stay constant before the history; stored reports are not rewritten. Undated legacy questions retain their text.
- At most three message boundaries plus the system boundary. The previously written completed-answer boundary remains eligible for lookup as the newest one is added. No new cache/provider/billing implementation or server transcript storage; same `executeResponse`, resource keys and usage accounting.

## What this does and does not guarantee

The first cold request writes an eligible system/context prefix. Later requests reuse matching prefixes and write the newly included history. In the explicit policy inherited from journals, completed assistant history is written when it first appears as input and can be read on the next request. The latest question, dynamic action state and newly added history are not automatically billed as cached input. Qwen uses the same stable message ordering with its existing automatic caching; OpenAI explicit markers and Claude controls remain in their existing adapters. The image Responses adapter still translates assistant boundaries to eligible input boundaries.

Cache hits depend on the provider, minimum length, expiry and exact compatible prefixes/settings. A changed model/preferences/timezone, edited history, or removing oldest turns to meet the context budget can rebuild the cache. The report-to-first-dialog JSON/text format change and compatibility overrides can also affect provider reuse. No claim of 100% cached input or guaranteed first-request miss. Provider-reported `cachedInput` and `cacheWriteInput` remain the billing authority.

Official reference consulted: https://developers.openai.com/api/docs/guides/prompt-caching

## Verification

102 tests passed across conversation context/service, all periodic analyses, journal cache continuity, OpenAI/Claude cache helpers and the image Responses adapter. New tests cover seven sequential replies with changing dates/active commitments, growing boundaries and retaining the previous explicit lookup boundary. Existing journal behavior and budget/whole-pair selection remain covered. No paid API request, application data mutation or device restart. Actual cache hits for the new app requests remain to be measured in provider usage.

Scoped lint passes for the changed helpers, conversation/period adapters and tests. Full `ai.service.ts` lint encounters the existing unrelated `no-base-to-string` expression in memory extraction; the shared-helper change does not touch that code. Full backend TypeScript was not rerun; focused Jest TypeScript compilation passed. API test ledger: fresh input 0, cached input 0, output 0, credits 0 (mocked provider). Agent token counters unavailable.
