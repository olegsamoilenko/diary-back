# Lite usage budget proposal — 29 September 2026

## Latest proposal: 10,000 input / 1,000 output per call

User requested recalculation with at most 10,000 total input tokens (including instructions/history) and 1,000 total billed output tokens (including reasoning). Calculation only; no limits/configuration changed. A 31-day month with two entries/day, two follow-ups on every entry/day/week/month report, five weekly reports and one monthly report has 297 main-model calls. At ordinary uncached rates Terra costs 320/call = 95,040. Charging all input at the current explicit cache-write rate costs 370/call = 109,890; this is the conservative no-cache-hit case.

If all 37 proposed Luna period-capsule calls also use 10k/1k, add 1,184 at ordinary input rates or 1,369 at cache-write rates. Keep the empirical entry/helper allowance of 2,852 separate from these limits: it is not a tested maximum. Totals are 99,076 ordinary / 114,111 cache-write credits. Retaining 1,500 total output tokens for the five weekly and one monthly capsule instead adds 36 credits. One-entry/day variant: 204 main calls, 1,426 helper allowance, same37 period capsules; 67,890 ordinary / 78,275 cache-write. Qwen two-entry case: 81,256 ordinary input, or 81,441 when Luna input uses cache-write pricing; Qwen automatic caching does not incur the hypothetical explicit-write rate used for Terra.

Reproduction: `.tmp/lite-10k-1k-cost.cjs`. These totals assume the specified input/output counts, not provider-measured future workloads. 1,000 billed output tokens is not 1,000 visible tokens when reasoning is enabled. The previously proposed weekly/monthly 13k/13.5k inputs do not fit a 10k total-request cap; context/history budgets need redesign before implementing this variant. A 120–130k package is a planning proposal with headroom over this calculation, not an approved tariff or an unconditional usage guarantee.

Discussion/calculation only. No plan credits, prices, model settings, context rules or capsule workflow were changed. Current plan catalog: Lite 30,000; Base 60,000; Pro 120,000 credits.

## Proposed Lite workload

31-day planning month; 1–2 journal entries per day, two user questions/AI answers per entry; one daily report and two follow-ups per day; five weekly reports, each with two follow-ups; one monthly report. Two monthly follow-ups are included as a disclosed reserve. The upper case (two entries/day) has 99 initial responses and 198 dialogue responses. Annual analysis, media, extra questions, and retries are excluded.

Input assumptions including system instructions: entry 12,000 (approximately the September 13 observations); day 11,000; week 13,000; month 13,500. The hierarchical week/month collector is still a proposal. Exact calendar-month edge handling and provider-specific tokenization remain unresolved.

Working output allowance: 1,000 billed tokens per initial answer, 800 per dialogue answer, including reasoning. Approximate dialogue input history: previous initial answer allowance + 100 tokens per user question + prior dialogue answer allowance. Using billed output as history allowance is conservative where reasoning is hidden; these are scenario assumptions, not measured Terra output.

Rates and rounding use current `src/plans/types/credits.ts` and `tokensToCredits.ts`. Cache-hit scenario: the full original context is reused on both follow-ups, with added turns paid normally; this is not guaranteed. Terra initial input uses cache-write rates. No-hit Terra scenario conservatively charges all input at cache-write rates. Qwen uses normal input rates on misses and cache-read rates on hits (automatic caching).

Technical-memory allowance from the September 13 sample: 20 credits per entry for user/assistant memory and observed embeddings, plus 13 per entry dialogue. This is an empirical allowance, not a hard maximum. No additional capsule is assumed for report dialogues. Proposed background period capsules reserve Luna input at full cache-write rate plus 2,048 total output tokens, including reasoning: 53/day, 58/week, 59/month = 1,992/month. Visible target capsules remain 1,000/day and 1,500/week/month; the separate Luna flow is not implemented.

## Working monthly estimates

| Main model | Entries/day | Base context cached in dialogues | No cache hits |
|---|---:|---:|---:|
| Qwen 3.8 Max | 1 | 38,066 | 65,732 |
| Qwen 3.8 Max | 2 | 55,550 | 96,236 |
| GPT-5.6 Terra | 1 | 51,804 | 89,301 |
| GPT-5.6 Terra | 2 | 75,612 | 130,717 |

Terra, two entries/day, working output:

| Component | With base cache | No cache hits |
|---|---:|---:|
| 62 entry responses + 124 follow-ups | 44,764 | 79,980 |
| 31 daily reports + 62 follow-ups | 21,483 | 37,665 |
| 5 weekly reports + 10 follow-ups | 3,755 | 6,825 |
| 1 monthly report + 2 follow-ups | 766 | 1,403 |
| Entry/dialogue technical memory allowance | 2,852 | 2,852 |
| Background period capsule allowance | 1,992 | 1,992 |
| Total | 75,612 | 130,717 |

## Stress scenario and interpretation

With the same input/question/count assumptions, Terra uses 2,048 total output tokens for initial/entry-dialogue replies and 1,800 for period dialogues (current code ceilings). Monthly result: 122,014 with the original context cached, 178,765 without cache hits. This is not an absolute account maximum: longer questions, larger contexts, extra calls and technical extraction variability change it.

30,000 credits does not support the stated upper Lite workload using Terra under these assumptions. Around 100,000 is a working usage budget reliant on response lengths/cache; around 200,000 covers this stress scenario with roughly 12% headroom. These are budget proposals, not approved entitlements or retail prices. Retail margin/store fees/taxes must be assessed separately before changing packages; increasing credits does not reduce provider cost.

Reproduction: ignored `.tmp/lite-plan-cost-scenarios.cjs` uses the actual credit conversion function; results `.tmp/lite-plan-cost-scenarios.json`. No paid AI calls or device operations performed. Codex fresh/cached/output counters unavailable.
