# Optional web search — 5 November 2026

User authorized adding current public-web information to Nemory AI responses. Implemented locally; not deployed. Initial search support required no mobile production changes; the later citation-animation fix is recorded in `diary-front/docs/ai-response-rendering.md`.

## Separate search cost — 5 November 2026 follow-up

User explicitly requested showing the web-search fee separately from input-token cost.
History now stores token-only `inputCredits`, `outputCredits` and a distinct
`webSearchCredits`, with `totalCredits` unchanged. The statistics API returns the
split plus `webSearchCalls`; the live landing admin cost chart has a separate
Web search series and a labeled credit breakdown. AI diagnostic operation/cycle
logs also separate search fees. General finance reports already sum totalCredits
and therefore retain the complete cost.

`getWebSearchCredits` owns the existing fee calculation. The established two-bucket
legacy/V2 plan debit contract remains internally compatible: inputUsedCredits
there includes the tool charge, but is split before storing or displaying history.
No balance, allowance, token count, provider price or total charge changes.

Migration `1793865600000-SeparateWebSearchCredits.ts` backfills only old search
rows whose fee is still inside inputCredits. It leaves totals and wallets/plans
untouched and ignores already-separated rows; down restores the old representation.
It was applied to the local `nemorydb`: two historical rows, total 268 unchanged,
inputCredits 246→46, outputCredits 22 unchanged, webSearchCredits 0→200.
Production migration/deployment was not performed.

Validation: 113 tests across history, statistics, token conversion, search flow
and legacy/V2 billing passed; backend and landing TypeScript passed. Real local
PostgreSQL temp-table test passed for backfill, idempotent repeat, already-separated
rows, malformed historical totals and down migration (`node test/web-search-credit-migration.cjs`).
New/touched accounting and landing files pass scoped lint; ai.service retains
pre-existing unrelated lint findings. Chart rendering was not manually inspected.
External AI API calls for this follow-up: zero; Codex usage counters unavailable.

## Shared execution

`AiService.executeTextResponse` extends the existing `executeResponse` provider/accounting lifecycle for `tier_response`: entries, check-ins, their dialogs, conversations, periodic analyses and period dialogs. Capsules, extraction and context compression do not search. Existing tone, response schemas and model selection remain intact.

`src/ai/web-search/web-search.ts` provides a common internal action envelope. The selected GPT/Qwen/Claude model can request one lookup instead of its final answer, only for a direct search request or information needing current external facts. Ordinary reflection should answer normally. This is model-driven selection, not a deterministic guarantee that every relevant question triggers search. Requests not to browse are respected by the instruction.

The internal action never streams to the user. Malformed actions become unavailable evidence; a repeated action after retrieval is suppressed and fails explicitly after accounting. The same selected model then receives the retrieved evidence and returns its normal answer. Resolved media is reused without repeat transcription. Existing cache prefixes and breakpoints are retained; a cache hit is not guaranteed.

Lookup uses the existing OpenAI Luna Responses client with `web_search`, `tool_choice: auto`, `max_tool_calls: 1`, `store: false`, a 60-second timeout and no automatic retries. A live test showed that `required` plus the one-tool limit could yield reasoning-only output; `auto` returned cited visible evidence. A completed search, visible summary and safe provider URL citations are all required before evidence is considered available. Failed/empty retrieval continues with an explicit inability-to-verify instruction; it must not claim a successful search.

Only a minimized public query reaches the lookup, never the entire diary context. The selected model is instructed to omit private people, journal passages, credentials, contacts and medical history. Backend guards additionally reject URLs, email/phone-like identifiers, multiline or overlong queries. These are defense in depth, not a guarantee of semantic anonymization. External evidence is marked untrusted and cannot authorize further actions. Existing selective diagnostic retention is unchanged; no new search-content store is added.

Provider-backed sources are retained as clickable Markdown links, including a fallback suffix in text/shortText/fullText when omitted. The existing live frontend `AiResponseText` renderer already opens these links. Only a frontend regression test was added.

## Credits and deployment

Three separately accounted stages when search is selected: `prepare_web_search` (initial model usage), `web_search` (lookup usage and completed search actions), then the existing final-response operation. Each uses `persistAiUsage`, `TokensService`, `SubscriptionUsageService` and the legacy/V2 paths. Affordability is checked before each paid stage; actual provider usage remains billable on cancellation or absent answer text under the existing policy. Network failures with no usage are not estimated or retried. Completed native searches without usable evidence still incur their actual usage/fee.

Native search costs $10 per 1,000 searches, plus model tokens: at the existing 10,000 credits/USD conversion, each completed search action adds **100 credits**, with no markup introduced here. Count only completed `action.type: search` items, not page-open/find actions. Cached reads and reported cache writes retain existing pricing. History exposes the fee as webSearchCredits, separately from inputCredits. `webSearchPreparationCredits` is an additive response-usage field; existing final-model token fields retain their meaning and response total includes search preparation.

New `token_usage_history.webSearchCalls` (integer, default 0) records the non-token billable unit for audit without fabricating tokens. Migration: `1793836800000-AddWebSearchUsage.ts`, followed by the separate-credit migration above. Apply through the normal backend deployment/migration process before using the new entity. The existing app has `synchronize: true`; this change does not alter that setting. No production deployment was performed.

Enabled by default; `AI_WEB_SEARCH_ENABLED=false` disables it. See `.env.web-search.example`. Existing OpenAI credentials are reused. No app-store release is needed for source links.

## Verification

- Focused helper/orchestration tests cover GPT/Qwen/Claude adapters, ordinary answers, disabled/auxiliary work, JSON/text streaming, private identifier rejection, malformed/repeated actions, billing failures, cancellation and unavailable evidence.
- Final backend run: 4 suites / 131 tests passed, covering web orchestration, legacy/V2 billing integration, access, cache continuity and prompt contracts. Token conversion, token-history and subscription-usage suites also passed earlier. The final rerun used a workspace-local Jest cache after the sandbox temporary cache rejected a rename.
- TypeScript passed. Scoped ESLint found only existing assertions in image generation and existing object-to-string usage outside this feature; the new helper/tests/accounting files passed.
- Existing frontend link renderer: 2 focused tests passed, including the exact angle-bracket citation format. Broader renderer suite had an unrelated existing UUID ESM fixture-import failure; no production frontend code changed.
- Live synthetic public-query test: initial model selected the search action; corrected retrieval completed with one search, 498 visible characters and a cited source. No private journal/user data was used. No on-device or production acceptance is implied.

Provider diagnostic ledger (three calls, including the initial reasoning-only retrieval): input 13,793 = 4,912 ordinary fresh + 4,394 cache-write + 4,487 cached-read; output 534 including reasoning. Two native search actions. These are direct API diagnostics, not application-user debits or Codex account/quota counters. Exact Codex fresh/cached/output usage is unavailable.

References: [OpenAI web search](https://developers.openai.com/api/docs/guides/tools-web-search), [OpenAI pricing](https://developers.openai.com/api/docs/pricing). Follow-up: deploy backend/schema, then check an ordinary reflection and a current-information query in the installed app; confirm visible source links and debited credits. Reassess query privacy and search-selection quality using synthetic cases before expanding to more autonomous browsing.
