# Period hierarchy — 30 September 2026

Exact working copies were saved before editing; `before/`, `after/`, `manifest.json` and `changes.patch` record the change independently of the dirty Git baseline. Files end in `.ts.txt` so TypeScript does not compile archival source.

Final user decision supersedes the intermediate context budgets: no application input-token ceiling for day, week or month. Token measurement and credit estimates remain. No history is removed due to token count or the old 7000-character ceiling. The existing transport and provider limits remain.

Weekly analysis now receives all available dated day capsules for its week and only older weekly capsules for comparison. Its main model produces text only; Luna generates the week capsule for future monthly use through the same bounded two-pass pipeline as day capsules.

Capsule maxima Lite/Base/Pro: day900/1200/1500; week1100/1350/1700. Prose targets use90% of the maximum less fixed source observations. A failed/oversized retry retains the first complete capsule; failure never discards the main answer. Entry/check-in source-capsule budgets are unchanged.

For a quality rollback, compare the prompt wording in `daily-capsule.ts.txt` and `periodic-analysis.prompt.ts.txt` and restore the relevant instruction blocks while retaining current policy parameters and the text-only weekly contract. Do not blindly restore these entire files: the new weekly frontend payload and separate capsule lifecycle must stay compatible. This package records the architecture change as well as wording; it is not a standalone deployment rollback.

The earlier `20260930-day10-12` correction archive is unchanged. Its pre-hierarchy patches require review against these new signatures before application. Never reset the entire dirty worktree.

Validation and final scope: see `../../period-capsule-hierarchy-20260930.md`. No paid model requests or device seed run performed by the assistant.
