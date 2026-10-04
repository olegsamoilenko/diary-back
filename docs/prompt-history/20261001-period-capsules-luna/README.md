# Separate month/year Luna capsules — 1 October 2026

User requested removing capsule generation from the main summary prompt while discussing response-length units.

All four main period tasks now return text only. Month/year extend the existing day/week Luna runner through AiService.executeResponse, using the same selected source payload and main answer. Week retains its approved daily-capsules-only source. Result shape and local client storage remain compatible. Every capsule is still returned as report.capsule; this is not server persistence.

Existing sizes preserved: day/week tier token budgets unchanged; month1500/year1800 characters retained explicitly until a new token policy is approved. Diagnostics retain actual tokens, with maxCharacters/targetCharacters for the two character policies. API ceilings are tokens with reasoning/JSON allowance, not a character-to-token conversion. One conditional compression pass; preserve a complete first capsule on failed/oversized retry, and preserve main answer if Luna fails. No response length values changed.

New monthly_capsule/yearly_capsule usage types and additive migration1790870400000. Run the migration on deployments with schema synchronization disabled before serving new capsule calls; migration was not applied to any database in this task. Shared SDK outputPurpose recognizes all period capsules, avoiding the normal-response cap. Estimates include primary and conditional compression cost; accounting closes after capsule attempt.

Monthly context selection was not changed: the previously noted weekly-capsule-plus-day-tail gap remains separate work. No paid provider calls, user data modification, regeneration, or process restart performed. Real-output quality awaits the next seed.

Snapshot before/after plus changes.patch captures only this task's source edits. Check rollback with git apply --reverse --check; if clean, a requested rollback can use --reverse without discarding unrelated work. Enum migration rollback retains historical billing enum values.

Validation:126 focused tests across six suites passed (117 in the final affected-suite run plus9 unchanged prompt/common-budget checks). Scoped ESLint passed for the changed period/token/migration files; full AiService lint still reports the unchanged no-base-to-string expression at line6402. Full tsc stops at TS2589 in unchanged src/ai/media/image-generation.service.ts:109. Reverse-patch check and diff check passed. Nemory provider usage for this task: fresh input0, cached input0, output0, billed credits0 (no paid calls). These are not Codex account usage counts.
