# Corrections after September 14–16

Authorized by the user after the three-day audit and the separate source-capsule compression change (Memora 2733). Keep useful psychological explanations and freely explored grounded hypotheses. Qualify personal causal claims without replacing substantive answers with questions.

Prompt changes:
- Shared REFLECTION_HYPOTHESES: verify the date/action/status behind historical counts; distinguish a plan from yesterday's completed action, reduced urge from non-action, self-report from confirmed mechanism. Avoid false binary tests and advice depending on unspecified notification behavior or agreements.
- Shared CAPSULE_FACT_PRECISION: preserve part/whole completion, targets/results, source/event times, duration/deadline, and self-reported motives. Used in ordinary memory extraction and BOTH periodic compression passes.
- First-pass day/week capsule explicitly retains distinct dialog questions, corrections, new explanations, practical criteria and decisions, rather than retaining only the initiating event. Second pass preserves those developments already present.

Live references: AiService extraction prompts, buildResponseSystemPrompt (both journal and periodic task branches), dailyCapsuleMessages and dailyCapsuleCompressionMessages. Schema, model, runtime token budgets, billing and single-retry fallback remain unchanged. Existing saved answers/capsules/frozen dialogue prompts are not regenerated.

Related frontend fixes:
- buildRankedCapsuleRetrievalPromptV2 reserves mandatory routine check-ins first, then newest available ranked Q/A pairs with complete parent capsules before extra ranked bodies. An oversized pair is skipped atomically; no orphan Q/A or partial text. Remaining sources, commitments, independent memory and recent backfill use the existing budget. This may select fewer bodies in exchange for retaining dialogue developments; it is recency prioritization, not a new semantic importance model.
- Both linked-entry-response-context.service and rebudgetEntryResponseContext use this shared policy. Parent IDs and actual selected planner links remain consistent; source memory deduplication and source objects remain intact.
- Future reruns of the Sep16 synthetic fixture: feedback at 11:20, correction/closure at 11:30, matching the planner completion step. Existing device data unchanged.

Validation: 94 frontend tests passed across retrieval, linked-context assembly, saved context and seed runner; 33 backend tests passed across shared response builder and source/daily capsules. Frontend TypeScript, scoped ESLint and diff checks passed. Backend TypeScript reaches the pre-existing unrelated TS2589 at src/ai/media/image-generation.service.ts:109; no errors in changed live files. Snapshot .ts files from this and the preceding source-capsule archive initially entered compilation; renamed all of those copies to .ts.txt, preserving contents and verified patch targets. Recheck leaves only the image-generation error. New tests cover tight-budget Q/A priority, chronological rendering, mandatory routine originals, oversized pairs, no source mutation and repeat rebudget without duplication. Model semantic compliance still needs a fresh user-run seed; unit tests cannot prove it.

## Rollback

before/ and after/ contain .ts.txt snapshots to keep archived modules out of compilation. Patches restore only the three backend prompt files, preserving the previous entry-capsule change. From diary-back:

```powershell
git apply --check --ignore-space-change docs/prompt-history/20260930-day14-16/rollback.patch
git apply --ignore-space-change docs/prompt-history/20260930-day14-16/rollback.patch
```

Dry-run passed. Inspect conflicts if later edits overlap; never replace whole dirty files or reset the checkout. Frontend selection/seed fixes are independent of this prompt rollback. Product/backlog notes must be marked superseded if rolled back.

Usage: no paid application calls, fresh input 0, cached input 0, output 0, credits 0. Codex token counts/quota deltas are unavailable; no estimate presented as actual usage. No seed rerun, device data mutation or server/Metro restart.

Next: seed Sep17, inspect final provider context for retained Q/A and actual selected bodies; compare source/first/second capsules for dialog conclusions, completion scope and temporal accuracy, and check the main response retains depth without unsupported certainty.
