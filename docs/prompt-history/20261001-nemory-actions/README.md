# Action-only extraction and usage types — 2026-10-01

Approved: distinguish action extraction from capsules, shorten its prompt, and distinguish conversation/entry/check-in/period dialogue usage. No new chat/context limits or heuristic skipping of extraction approved or implemented.

## Prompt

`src/ai/utils/nemory-actions-prompt.ts` owns the action-only instructions. The existing `extractAssistantMemoryCapsuleV2` endpoint selects it only for `actionsOnly:true`. Same Luna call, normalization, active-key deduplication, commitment lifecycle, language and local reminder executor. `assistantMemory` stays empty. The legacy capsule prompt/endpoint default remains compatible. A missing-promise repair, when triggered, also uses the new usage type; this change does not remove that fallback.

`extract-assistant-before.txt` preserves the previous complete method for targeted rollback; do not replace the whole live AiService. `actions-after.txt` is a synthetic assembled example. Offline `o200k_base` comparison with identical synthetic current exchange, language rule and empty active lists: 4036 -> 831 tokens (-79%). This excludes API message framing; production totals depend on exchange length, active actions and full language instructions. No paid model experiment was run, so extraction quality on fresh real answers remains to be observed.

No shared chat-topic memory or response capsule is created. Action extraction still runs after each complete answer; skipping greetings is not part of this patch.

## Accounting

| Type | Meaning |
| --- | --- |
| conversation | All answers inside standalone conversations |
| entry_dialog | Follow-up to an entry |
| checkin_dialog | Follow-up to a check-in |
| daily_analysis_dialog | Follow-up to a day report |
| weekly_analysis_dialog | Follow-up to a week report |
| monthly_analysis_dialog | Follow-up to a month report |
| yearly_analysis_dialog | Follow-up to a year report |
| periodic_analysis_dialog | Historical report dialogue with period unavailable |
| nemory_actions | Action-only extraction and its optional missing-promise repair |
| dialog | Legacy rows without enough evidence to classify |

New action operation is `extract_nemory_actions`; optional repair is `repair_missing_nemory_action`. Existing real capsule types retain their meaning. Prices, debit order, account authorization, request IDs and cached-token accounting are unchanged. Backend statistics and existing admin charts expose all new categories.

Migration `1790856000000-AddAiUsageOperationTypes` preserves all existing enum values and updates old `dialog` rows using exact operation names only. Old period operations omit the period, so their kind is not guessed. Old capsule rows did not persist actionsOnly; do not blindly rename them. This includes the user's old diagnostic capsule row. Migration down retains classifications and charges rather than deleting enum values or guessing old types.

Applied to configured local PostgreSQL only: 73 rows, all fields other than type fingerprint-identical. Classified 1 conversation, 5 entry dialogs, 2 check-in dialogs. No production migration/deployment. A synthetic transactional PostgreSQL run verified enum extension, exact backfill, unknown-value preservation, idempotence and unchanged credits, then rolled back its test schema.

## Validation

- Related tests pass: statistics buckets, conversation provider lifecycle, period provider classification, legacy/V2 billing, migration and action-only extraction/normalization. Period suite 67/67; focused memory suite 11/11.
- Broad combined run initially 170 pass/7 fail; two period expectations updated for the requested new names and then pass. Remaining five failures are in unchanged memory test expectations (removed response-discipline/normalization diagnostic methods, prior durable-memory wording, extra optional billing argument).
- Landing TypeScript passes. Backend TypeScript reports existing TS2589 at image-generation.service.ts:109. AiService lint retains an unrelated no-base-to-string error in assistantData text conversion; new formatting issues corrected. Scoped new-file lint and whitespace checks pass.
- No paid test calls or notifications/deletions. Agent fresh/cached/output counters unavailable.
