# Professional psychologist role — 2026-10-01

## Accepted purpose

Explicit user request: integrate the professional psychologist role into entry, check-in, their dialogs and day/week/month/year analyses, without contradicting it later through bans on grounded hypotheses. The surrounding discussion also explicitly concerns standalone conversations. Nemory supports personal development through psychologically grounded understanding and feasible change; praise, paraphrase and generic reassurance do not replace this work.

## Implementation

- `journal-response-instructions.ts`: one exported `NEMORY_PSYCHOLOGIST_ROLE`, included in the live journal common instructions.
- `response-system-prompt.ts`: the same role replaces different identities for periodic analysis and standalone conversation. Existing shared mechanism/hypothesis instructions remain active. All period-specific tasks keep their output contracts and evidence scope.
- `conversation.context.ts`: explicitly invokes the professional psychologist role for personal material. Conversation-only history and absence of app actions remain unchanged.
- `ai-preferences.prompt.ts`: light analysis, non-confrontational style, very gentle sensitivity and straight delivery retain explanations instead of suppressing depth or disagreement. The shared role establishes that friendly/coaching preferences affect delivery, not specialization.
- `periodic-analysis.service.ts`: old saved prompts receive an explicit current-role/hypothesis override for the next dialog. New prompts already containing this role do not receive a duplicate. Stored report prompts, response history and contracts are not rewritten.

The live paths are `generateComment -> buildResponseSystemPromptParts` (all four journal modes), `PeriodicAnalysisService.systemPrompt -> buildResponseSystemPrompt` (all four periods), and `ConversationService.reply -> buildResponseSystemPrompt`. Periodic dialogs reuse frozen prompts and therefore need the request-time compatibility override.

Factual safeguards are retained: distinguish hypotheses from facts, source times from event times, plans from actions, repeated interpretations from independent evidence. These do not ban psychological explanations. Capsule extraction remains factual compression, not a new user-facing psychological analysis; its prompts are unchanged. No context budgets, response lengths, billing, provider, UI or persistence changes.

## Rollback

`before/` contains exact pre-edit copies, including the existing uncommitted work. Use those as the baseline, not Git HEAD. `after/` records this patch's resulting files. If further edits exist, reverse only the before/after differences rather than overwriting later work. The periodic prompt file is included as an unchanged contract reference.

## Validation

Passed: 92 tests across `response-system-prompt.spec.ts`, `conversation.service.spec.ts` and `periodic-analysis.spec.ts`; scoped ESLint after formatting fixes; targeted diff/whitespace review. Coverage includes all four journal modes, all four actual periodic tasks, standalone conversation, gentle/light style variants, and both saved periodic prompt versions without stored-history mutation or duplicate role injection. Full `tsc --noEmit` reports the previously known TS2589 at `src/ai/media/image-generation.service.ts:109`; that unrelated module was not changed.

No paid provider request or phone generation is part of this patch. Automated checks verify prompt routing/contracts, not model response quality. Next quality review should compare the same meaningful source material before/after for explanatory mechanisms, grounded hypotheses, new understanding and useful actions without automatic agreement.

Usage: no application model calls or credits consumed by these changes/tests. Agent fresh/cached/output token counters are unavailable; no estimate is asserted.
