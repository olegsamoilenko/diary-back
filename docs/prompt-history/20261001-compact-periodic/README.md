# Compact periodic prompts — 2026-10-01

User requested compression of the shared period prompt to approximately2500 tokens and a full Ukrainian translation in chat. Token target uses the existing Qwen code-point/3 estimate, not provider-measured system usage; o200k is reported separately.

Changed: period task analysis/evidence/format/entity instructions; optional compact response-builder scaffolding; existing style renderer extended with minimal labels; compact language rendering. Actual PeriodicAnalysisService.systemPrompt selects these formats. Existing shared psychologist identity and Nemory capabilities are unchanged. Other entry/check-in/dialog/conversation default prompt bytes verified unchanged against the before snapshot.

No output schemas, character limits, context budgets, providers, billing, source selection or saved data changed. Day/week still use separate Luna capsules; month/year still return inline capsules. Existing saved dialog snapshots are not rebuilt. Fidelity rules remain in Luna prompts; the main day/week model no longer receives memory-writing instructions. No paid calls or seed replay.

Before files are in before/, after files in after/. changes.patch covers only this turn's edits, preserving earlier uncommitted work. To roll back from diary-back, first run `git apply --reverse --check docs/prompt-history/20261001-compact-periodic/changes.patch`; only if it succeeds apply with `git apply --reverse`. If later edits conflict, inspect them rather than force replacement. Root product/pipeline documentation records the current decision and should be updated if rolled back.

Validation:122 targeted tests passed across periodic prompt/service and shared response builder. Offline isolation check confirmed identical bytes for entry/checkin/dialog/checkin_dialog/conversation and existing style modes. Exact final prompt measurements are in measurements.json; readable assembled prompts are in after-prompts/. Checks establish assembly/contracts, not live model quality; next user seed remains required for that.

Scoped ESLint passed for prompt, builder, preference and periodic-service files. Whole ai.service.ts lint also reports an unchanged no-base-to-string issue in normalizeDialogMemoryCapsuleV2; this patch does not touch that conversion. Changed-line formatting corrected. No provider tokens or app credits consumed by this work.
