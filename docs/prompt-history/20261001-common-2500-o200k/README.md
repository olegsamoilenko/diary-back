# Shared response prompt — 1 October 2026

User authorized one common block for entry/check-in/dialog/conversation/day/week/month/year, with general reasoning + service data/style + a separate task for each mode. The limit is2500 actual **o200k_base** tokens for common+service+style, superseding the earlier Qwen-estimate target.

## Measurements and scope

- `common.en.txt`: exact assembled shared fixture with request time —2356 tokens. Stable prefix alone2341.
- Core rules1905, capabilities327, all12 style values with heading66; identity/language/time and separators make up the rest.
- Fixture uses Олег, Ukrainian, Europe/Kiev, default styles, an illustrative request timestamp, empty aboutMe/goals. Arbitrary personal data remains complete; it can increase the size beyond2500. This patch does not add a paid-call rejection or truncate context.
- `common.uk.txt`: complete Ukrainian review translation with placeholders and default style values,4175 o200k tokens. It is not the runtime language or a2356-token Ukrainian prompt.
- `measurements.json` and `assembled/`: exact instruction prompts and full counts after adding separate tasks. Source/context/media and protocol overhead are excluded.
- Common rules retain the professional psychologist role, grounded mechanisms/hypotheses and substantive answers, evidence attribution, source timing, planner semantics, media interpretation and action lifecycle. Repeated local reasoning blocks removed. Shared language/style rendering replaces divergent branch rules.
- Existing journal task/output contracts and period output/capsule limits preserved. Day/week still separate Luna; month/year retain existing inline capsules. Luna extraction/compression untouched. No paid API calls, DB changes, migrations, deployment or service restart.
- Mutable time remains outside the stable journal/conversation prefix. Older saved reports keep their prompt; static current-rule overrides use the existing follow-up mechanism. Their complete replay can remain larger than2500. New prompts use one common block. No guarantee of provider cache hits after this prompt version change.

## Verification

140 tests passed across shared budget/response builder, real periodic prompt assembly, periodic lifecycle/compatibility, conversation lifecycle/cache and cache-boundary suites. Scoped ESLint passed for changed prompt/service/test files except AiService, whose full lint has a pre-existing unrelated memory normalizer issue. AiService patch inspected: only style/language assembly changes. Diff whitespace check passed. No model response quality claim: next real seed is required.

Budget tests include all9 freshly assembled modes, all12 style fields, short/normal/detailed variants, a nonempty Ukrainian profile and request time; verify identical shared blocks, mode task separation, unchanged prefix under time changes, no truncation of arbitrary user data. Existing tests cover legacy schemas, first-entry welcome, media capability gating, prompt preservation and growing dialog cache boundaries.

## Rollback

`before/`, `after/`, `manifest.json`, and `changes.patch` contain only this change, preserving earlier dirty-worktree edits. The new shared-budget test is recorded as a new file.

From diary-back, first run `git apply --reverse --check docs/prompt-history/20261001-common-2500-o200k/changes.patch`. Apply `--reverse` only if the check succeeds and rollback is requested. This restores previous code/test bytes semantically without resetting the worktree. Update the latest sections of root NEMORY_PRODUCT.md and docs/ai-response-pipeline.md to record a rollback; documentation changes are outside the runtime patch. Do not restore the older compact-periodic rollback package to undo only this change.
