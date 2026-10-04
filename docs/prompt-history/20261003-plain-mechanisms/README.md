# Plain explanations, practical steps and required historical connections

User-approved on 3 October 2026. Replaces two existing paragraphs of `NEMORY_COMMON_INSTRUCTIONS` in `src/ai/utils/journal-response-instructions.ts`; no additional runtime block. All existing common-builder consumers (entries/check-ins, their dialogs, standalone conversations and periodic analyses) receive the rules when constructing a prompt. Existing saved dialogue snapshots are not rewritten.

The user selected the simple mechanism paragraph plus practical steps below. The preceding unapproved STYLE AND LANGUAGE proposal from the Sep18 audit is NOT applied. Existing psychologist role, source-fidelity rules, style settings and context availability remain. Meaningful psychological analysis is still required; ordinary acknowledgments retain their existing task-specific behavior.

## Approved mechanism paragraph — Ukrainian

Аналізуй ситуацію, яку описав користувач, і пояснюй, які психологічні механізми можуть стояти за його реакціями. Не обмежуйся переказом подій, назвою емоції чи схваленням. Поясни простими словами: що зачепило людину, що вона подумала про цю ситуацію, що відчула і чому захотіла діяти саме так. Покажи, що ця поведінка їй дає зараз і до чого може приводити надалі.

Після пояснення запропонуй конкретні практичні кроки, які допоможуть розібратися із ситуацією: що можна зробити, сказати або змінити. Поясни, як ці кроки пов’язані з описаним механізмом, чому можуть допомогти й за чим людина помітить результат. Враховуй її обставини та можливості, щоб поради можна було застосувати в житті.

## Required history search and description — Ukrainian

Завжди перевіряй надану історію на зв’язки з поточною ситуацією, зокрема між різними сферами життя. Коли є доречні минулі епізоди, обов’язково опиши зв’язки: назви дату або ситуацію, порівняй реакції та механізми, поясни, що повторюється або змінюється і чому це важливо зараз. Якщо дані не підтверджують зв’язок, не вигадуй його. Спільна тема чи перекази однієї події не означають повторення. Спирайся на поради, спроби й результати, не повторюючи невдалі поради й не видаючи старі за нові. Минулі аналізи — не поточні події. У підсумках враховуй усі надані джерела періоду.

Search here means examining history already supplied to the model, not adding retrieval/tool calls or unavailable diary history to standalone conversations. No fixed number of historical examples or compulsory invented link.

## Size and rollback

Exact English runtime paragraphs, measured using tiktoken/o200k_base: mechanism119->137, history79->111, total198->248 (+50tokens). `tokens.json` records the counts. Context budgets, visible-answer guides, provider, billing and Luna prompts are unchanged.

`before/` and `after/` contain byte-exact snapshots of the runtime file and three specs aligned with the new wording. `manifest.json` lists them. `python rollback.py` checks without writing; explicit `--apply` restores only if all files still match this patch's after state. It refuses later edits. This rollback preserves the earlier mechanism/history changes; use older batches in reverse order only if those too should be reverted.

Real readability and useful historical comparison still require the next actual user-run seed. No paid model calls made for implementation.

Validation: 191 tests passed across response-system-prompt, shared-response-budget, periodic-analysis.prompt and periodic-analysis service. Common+service+style fixtures remain within2500o200k. ESLint clean for runtime and two focused prompt specs; the broader periodic service spec has328identical baseline findings, no new findings (compared programmatically against this batch's before snapshot). Test formatting then aligned without semantic changes. Guarded rollback dry-run4files passes. No audit API fresh/cached/output tokens or credits used; Codex turn usage counters unavailable.
