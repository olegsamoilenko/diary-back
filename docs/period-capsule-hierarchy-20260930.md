# Period capsules and context — 30 September 2026

## Final tariff update — 1 October 2026

This user-approved table supersedes the intermediate limits and pending month/year decision below. Context token maxima (system prompt excluded):

| Period | Lite | Base | Pro |
|---|---:|---:|---:|
| Day | 8000 | 12000 | 18000 |
| Week | 10000 | 15000 | 22000 |
| Month | 12000 | 18000 | 27000 |
| Year | 14000 | 21000 | 32000 |

All four periods now use the same current-evidence-first budget guard and previous-capsule selection for both estimate and generation. Capsule maxima, entry/check-in budgets, frozen dialog history and prompts are unchanged. Monthly source composition remains the separate known gap described below; setting its budget does not implement weekly-capsule hierarchy.

## Restored day/week context limits — 1 October 2026

The user requested restoration for further context/response audits. Lite/Base/Pro day context is 8000/11000/15000 tokens; week is 9000/12000/16000. These supersede the disabled day/week ceilings below. The budget includes the current-period snapshot, active commitments, clarification, period metadata and prior capsules; system instructions are separate. Complete current-period evidence has priority, then whole previous capsules in existing newest-first order until the next cannot fit. An oversized current period throws `ANALYSIS_CONTEXT_LIMIT` before claiming execution or calling a provider. Estimates and generation share this selection. Saved dialog prefixes and capsule compression policies are unchanged.

`period.context.selection` records the effective ceiling, current and selected context counts, retained previous periods and excluded periods with the budget reason; overflow is logged before rejection. Entry retrieval diagnostics now also identify selected source dates/IDs/scores/reasons, dialog counts, effective budget and independent-memory count. Existing development-only exact request logging remains the authority for actual model input; no new content storage.

Month/year context limits remain unset pending the user's tariff decision. Current month snapshot still uses day data/planners; the agreed weekly-capsules-plus-uncovered-days composition is not yet wired. Monthly capsule instructions still use 1500 **characters**, not the day/week token policy; do not confuse the units when setting yearly budgets. Year snapshot uses available monthly capsules with explicit missing months.

Validation: 72 periodic service tests passed, including exact boundaries and overflow for all six day/week tiers, unchanged full current evidence, estimate/generation parity, and no provider/execution claim on overflow. No paid API request or seed run performed.

Current user decision: disable input-context token ceilings for daily, weekly and monthly analysis while auditing the existing oversized capsules. This supersedes today's intermediate day8000/11000/15000 and week9000/12000/16000 settings. Estimates and generation use the same full selected context. Previous capsules are no longer excluded by token count, a ten-report selector cap or the old7000-character budget. Ownership, dates, timezone, non-overlap, DTO transport limits (up to100 supplied previous reports), provider context-window limits and credit affordability still apply.

Weekly source is `snapshot.version=3`, `source=daily_capsules`. The local repository reads all usable completed day capsules inside the week, latest usable saved version per date, with owner/timezone/asOf checks. It does not load original journal entries, their analyses/dialogues or planners again. Backend validates the day boundaries and rejects duplicates/future sources; strips unrelated snapshot fields. Available day capsules are chronological; missing dates are explicit unknowns. The September13 seed specifically requires all seven dates07–13 before the weekly paid call. Its22:00 day step awaits the saved day capsule before22:10 weekly preparation. Both coverage and token counts appear in diagnostic file logs (`weekly_daily_capsule_coverage`, `period.context.selection`). Older weekly request payloads must be rebuilt by the updated client; they fail before a paid call rather than silently using raw weekly context.

Weekly `previousAnalyses` contains only earlier weekly capsules. All valid non-overlapping supplied history is used regardless of its token count. Current/previous periods remain separate in the prompt. Existing device reports and frozen dialogue prefixes are unchanged.

Daily and weekly main models produce user-facing text. The existing shared Luna workflow receives the same source payload plus the main answer, with factual attribution, dates, reaction/correction and hypothesis rules. Capsule maximum tokens Lite/Base/Pro: day900/1200/1500; week1100/1350/1700. The initial and retry prose budget targets90% of the cap; daily exact observations are reserved and reattached. One conditional rewrite compresses the first complete capsule only. Oversized/failed rewrites retain the first complete capsule with `over_budget`; first-pass failure retains the main analysis with capsule status`failed`. Credits from both calls are accumulated through `executeResponse`; usage types distinguish `daily_capsule` and `weekly_capsule`. No new backend content storage.

Month input composition and its existing inline month-capsule workflow are unchanged in this task; its previous-history character/token exclusions are removed. The generated weekly capsule is saved locally and available for the future monthly hierarchy. The calendar-boundary policy for monthly source weeks remains a separate decision.

Entry/check-in memory-context limits are6000/9000/12000 for Lite/Base/Pro. They cover the history/memory block, excluding the current entry, planning/system instructions. Selection uses the current owner's existing server-resolved subscription state; wallets do not choose a tier. Primary semantic/all-history selection, linked-source selection, fallback and frozen-dialog rebudgeting use the same mapping. A larger plan gets its own overflow flag so the earlier6000 ceiling does not permanently prevent trying a larger complete context. Existing frozen conversations are not expanded until their ordinary refresh; downward rebudgeting preserves their original source time. Source-ID deduplication and fresh routine-checkin priorities remain.

Versioned prompt comparison: [archive](prompt-history/20260930-period-hierarchy/README.md). No production deployment, paid AI call or phone seed run was performed. Actual response quality, provider tokens/credits and seven real daily capsule coverage will be checked after the user's next seed.

Validation:48 periodic orchestration/contract tests and6 capsule-budget tests passed;30 frontend periodic repository/snapshot/service tests passed;96 frontend memory selection, tier mapping, upgrade flag, fallback, linked-source and frozen-dialog tests passed. Frontend TypeScript passed. Scoped lint passed with two existing i18next warnings in the seed runner. Full backend TypeScript remains blocked by TS2589 at `src/ai/media/image-generation.service.ts:109` (TypeORM insert of the entity; file unchanged by this task); focused TypeScript/Jest compilation of the affected backend flow passed. Local read-only schema inspection confirmed `weekly_capsule` already exists in the usage-history enum. An idempotent migration is included for other environments; no database data migration was executed here.

Usage ledger for this implementation: paid provider calls0; fresh input0, cached input0, output0 billed through the Nemory API by the assistant. Codex account-wide token/quota consumption is not available per task and is not included in this application ledger.
