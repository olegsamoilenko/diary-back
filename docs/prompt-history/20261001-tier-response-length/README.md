# Tier response lengths — 1 October 2026

User approved these visible-answer upper guides, excluding reasoning and capsules. They are approximate prompt instructions, never minimums or runtime string truncation.

|Response|Lite|Base|Pro|
|---|---:|---:|---:|
|Entry/check-in|600|900|1300|
|Dialog/conversation reply|500|800|1200|
|Day|800|1200|1800|
|Week|1200|1800|2600|
|Month|1600|2400|3400|
|Year|2200|3200|4500|

Source of truth: src/ai/utils/response-length.ts. Live journal/check-in/dialog, conversation and periodic adapters resolve server-side effective legacy/V2 plan with SubscriptionUsageService. No-plan/purchased-only access follows existing Lite fallback. User style remains qualitative inside the guide. The main common prompt and context/capsule budgets are unchanged.

Removed old main-answer character instructions and the16000-character periodic-parser guard (which could reject a valid4500-token annual answer). Existing shortText preview stays600characters; fullText receives the visible-answer guide. Period follow-ups explicitly override saved original analysis length instructions while retaining cached source/history.

SDK path: opt-in tier_response through the shared response-reasoning helper for streaming/nonstreaming OpenAI, Qwen, Anthropic and media Responses API. Total ceiling = visible allowance + reasoning reserve +256 format tokens. Initial reasoning reserves: GPT-5 family4096, adaptive Sonnet5 4096, Qwen1024 (existing thinking-only budget), other models0. Structured entry/check-in also allow600tokens for the existing600character preview. These allowances are not guaranteed reasoning partitions or billed reservations. Existing affordability preflight includes total ceiling; actual provider usage, including reasoning, determines billing. Paid calls may therefore require a larger available balance than the visible-text guide alone suggests. Capsule and legacy non-opted-in technical limits stay unchanged.

Snapshots before/after and changes.patch allow scoped rollback with git apply --reverse after --check. No database changes, restarts, paid API calls, regeneration or phone verification. Real seed response length and quality still need evaluation. Nemory provider ledger for this task: fresh input0/cached input0/output0/credits0; Codex account usage is not represented by these zeroes.

Validation:254 tests across11 focused suites passed (108 final affected-suite tests plus146 unchanged passing tests from the initial run). Covered all tier values, period estimate/generation parity, original/context cache continuity, journal and conversation routing, streaming/nonstreaming SDK ceilings, Qwen/Claude reasoning exclusion from visible output, legacy/V2 access, actual billing and capsule compatibility. Scoped production ESLint passed. Full tsc reports only the pre-existing TS2589 at src/ai/media/image-generation.service.ts:109. Reverse-patch check and scoped diff check passed. Real seed quality is unverified.
