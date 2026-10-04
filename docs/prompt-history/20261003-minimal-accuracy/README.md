# Minimal shared accuracy adjustment — 2026-10-03

User approved only the final two-sentence accuracy formulation after rejecting a broader rewrite. The existing first sentence in TASK AND EVIDENCE is replaced in `src/ai/utils/journal-response-instructions.ts`; no new section is added. Existing attribution and user-stated motives are preserved.

Approved Ukrainian meaning:

> Дотримуйся точності у фактах і поясненнях: зберігай, хто що зробив, та враховуй останні уточнення користувача. Психологічні причини пояснюй як обґрунтовані версії, якщо користувач їх не підтвердив; не подавай можливу причину як встановлену або єдину.

The psychologist role, mechanism explanation, practical advice, historical connections, styles, Luna extraction prompts and response/context limits are unchanged. All user-facing response modes inherit the shared block through `buildResponseSystemPromptParts`; no separate per-mode instruction copies were added. No provider calls, paid reruns, server restart or persisted-data changes were performed.

`replacement.json` records exact before/after text for a targeted rollback. Replace exactly one occurrence of `after` with `before` in its named file; abort if the current sentence differs. Do not restore a whole file or use Git reset in the dirty workspace.

English runtime replacement measured with tiktoken `o200k_base`: 15 → 54 tokens, net +39. Real response quality remains to be assessed on the next seed; passing assembly tests does not establish model compliance.

Validation: scoped ESLint and whitespace checks passed. Existing three focused suites: 48/49 tests passed; shared-response-budget and periodic-analysis.prompt pass. One unrelated response-system-prompt assertion still expects the old check-in guide of 600 tokens while the unchanged response-length policy supplies 700. This change touches only the common prefix, not that tested dynamic suffix; length policy and old assertion were left untouched. Sandbox Jest fs.realpath EPERM required rerunning tests with approved elevated execution. No AI API token usage; coding-agent fresh/cached/output usage is unavailable.
