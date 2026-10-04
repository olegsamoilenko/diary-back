# Combined capsule/action prompt checkpoint

Before-state copies were captured before this patch:

- `ai.service.before.ts.txt`
- `journal-response-instructions.before.ts.txt`
- `capsule-content-blocks.before.ts.txt`

`changes.patch` records changes to those files only; it excludes other dirty workspace work already present at capture. The `.txt` extension intentionally keeps backups out of the TypeScript build.

For a future rollback, first inspect `git apply --reverse --check docs/prompt-history/20261001-capsules-commitments/changes.patch` from diary-back, then reverse only the accepted hunks. Do not overwrite the entire current service from the backup: later work may exist. The patch includes prompt-adjacent normalization/policy wiring, so a tone-only rollback should select prompt hunks. The new `source-compression-policy.ts`, local reminder transport, lifecycle migration and periodic action wiring are separately documented in `docs/capsules-commitments-20261001.md`; reversing this patch alone is not a full feature rollback.

User-visible psychological explanation depth is preserved. Changes concern compression, explicit action capability/confirmation, and agreement lifecycle. Quality acceptance awaits a real controlled replay; no paid API call was made for these edits.
