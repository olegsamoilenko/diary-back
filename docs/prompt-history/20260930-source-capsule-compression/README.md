# Source capsule compression — 30 September 2026

Approved scope: entry/check-in userDigest and the capsule of its AI response. Compress the wording of every distinct meaning, rather than selecting main themes or paraphrasing the whole narrative at similar length.

Live references: AiService.extractUserMemoryDetailsV2 and extractAssistantMemoryCapsuleV2, with SOURCE_CAPSULE_BLOCKS and MEMORY_FACT_FIDELITY. The new shared SOURCE_CAPSULE_COMPRESSION is used only by those two extraction prompts. Periodic capsules and dialog-turn extraction keep their existing prompts.

Changes:
- Preserve all distinct events, actions, thoughts, feelings, physical reactions, doubts, decisions, outcomes and promises in compact clauses, including mixed emotions and changes of interpretation.
- Compress every AI explanation, mechanism, hypothesis and recommendation with its rationale, conditions and attribution.
- Replace source prose percentage/character instructions with coverage plus wording checks. No runtime output cap, DTO, schema, billing, model, retry or logging change.
- Clarify that fixed source observation metadata is attached by the server; other event dates remain in the prose.
- Keep the ten assistantMemory block contract: related meanings can share a block; relevance is not permission to omit meaning. Durable user-memory and promise eligibility rules remain separate.

Snapshots contain code only, stored as .ts.txt so the project compiler does not treat archives as live modules. before/ and after/ preserve the exact baseline and resulting versions; forward.patch and rollback.patch contain only this task's edits, including one existing test assertion updated for the changed prompt.

From diary-back, first check then apply:

```powershell
git apply --check --ignore-space-change docs/prompt-history/20260930-source-capsule-compression/rollback.patch
git apply --ignore-space-change docs/prompt-history/20260930-source-capsule-compression/rollback.patch
```

If later edits cause a conflict, inspect the affected hunks instead of overwriting whole files. No Git reset or checkout is needed. Product decision notes are not reverted by the patch; mark them superseded if the prompt is rolled back.

Validation: 17 focused tests passed (11 source-evidence/daily-capsule tests plus 6 selected extraction/promise/language tests; 41 unrelated tests in the memory suite were skipped). Scoped ESLint and git diff --check passed; rollback dry-run passed. No paid model request, seed rerun or server restart. Model quality is unverified until the next seed: compare each source meaning with its capsule and measure prose-only size separately from attached observations and JSON overhead. A shorter capsule alone is not proof of quality; an already terse source may have little safe redundancy to remove.

Usage ledger: application API calls 0; fresh input 0, cached input 0, output 0, application credits 0. Codex session token counts and account-wide quota deltas are unavailable here and are not inferred from the application ledger.
