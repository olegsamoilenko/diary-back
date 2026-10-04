# Sep27 accuracy corrections — 2 October 2026

Approved replacements inside existing shared paragraphs, not new per-mode blocks. The psychological paragraph changes only its opening attribution/motives and practical-test sentences; the remaining impulse/action, one-trial and feasible-advice sentences remain. Professional psychologist role and freely explored grounded hypotheses are unchanged.

## Scope and measurements

- Shared core:1905→1905 actual o200k_base tokens, role interpolated.
- Shared extraction fidelity:617→610 tokens, CAPSULE_FACT_PRECISION interpolated.
- Service/style instructions and task contracts unchanged. Budget tests verify assembled common+service+styles across all modes within2500 for the existing fixture;1905 is only the core.
- Evidence distinguishes author/action/outcome; reasoning separates possible intent from impact and practical checks from invented thresholds; measurements check aggregates/targets; capsules retain actor/date and specific confirmed advice.
- Existing shared response builder and MEMORY_FACT_FIDELITY consumers propagate these changes; no duplicated local rules.

## Weekly repeat selection

Week saves a valid completed shorter repeat even above its target. Equal/longer output retains the first. Invalid/empty/truncated/error output retains the first through the existing parser/error path. Both paid attempts remain charged and logged; over_budget is diagnostic. Day retains unconditional completed-repeat acceptance. Month/year rules, compression thresholds and context budgets unchanged. Saved capsules are not regenerated.

## Validation

126 tests pass across periodic lifecycle, live period prompt assembly and shared all-mode/style budget suites. The five-test capsule-content-blocks suite also passed before the final response-only wording adjustment; its extraction inputs did not change afterward. Tests cover all weekly tiers,2973→2350, in-budget repeat, equal/larger repeat, both-attempt billing and invalid/empty/truncated/network fallback for day/week. Mocked providers only: no paid calls or DB changes.

After tests, only assertion formatting changed. Scoped lint reports10 pre-existing service/spec issues; no changed-line findings. Real model quality remains unverified until the next seed. New system prefixes can require a provider cache refill; application TTL unchanged.

## Rollback

before/ and after/ preserve exact bytes for five runtime/test files. changes.patch is a review diff; mixed repository line endings can prevent git apply, so use the byte-checked helper.

Run `python docs/prompt-history/20261002-seed27-accuracy/rollback.py` from diary-back to verify every current file matches after/. Only after rollback is requested, add `--apply`. The helper refuses all writes if any file has later edits, then restores only the five snapshots. Update NEMORY_PRODUCT.md, docs/ai-response-pipeline.md and observations separately to record rollback. Never reset the dirty worktree.

Application API usage during this patch: fresh0/cache-read0/cache-write0/output0, credits0. Codex turn-level token accounting unavailable; no account-quota estimate substituted.
