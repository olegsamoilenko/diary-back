# Explicit historical links — 3 October 2026

User approved the exact proposed CONTEXT AND CONTINUITY replacement. One paragraph in `src/ai/utils/journal-response-instructions.ts` changed: identify relevant past episodes, compare mechanisms/responses, explain recurrence/change and its present value. Shared topics and retellings are not recurrence; prior advice/outcomes and source attribution remain protected. No callback quota or additional context selection. All existing shared response consumers receive this wording when building their prompt; frozen dialogue snapshots are not rewritten.

Exact paragraph count: 79 -> 79 tokens with `tiktoken` / `o200k_base`. No provider calls, credit use, model changes or budget changes.

`before/` and `after/` contain byte-exact source snapshots; `manifest.json` lists the single runtime file and the periodic prompt spec whose old wording assertion was aligned. Run `python rollback.py` to verify the current files match this patch without writing. Explicit `python rollback.py --apply` restores the before snapshots only if there have been no later edits. This preserves the earlier mechanism-focus changes. To roll back that older batch too, first undo this batch, then use its separate guarded rollback.

Real response quality must be evaluated on the next user-run seed: a grounded past episode, meaningful similarity/difference, and useful implication rather than a decorative date mention.

Validation: 49 focused tests passed across response-system-prompt, shared-response-budget and periodic-analysis.prompt. The first run caught the old literal history wording in four period cases; the assertion was aligned with the new equivalent rule and that suite passed on rerun. Shared service/style fixtures stay within 2500 o200k. No real provider calls; fresh/cached/output API usage for this change is zero.
