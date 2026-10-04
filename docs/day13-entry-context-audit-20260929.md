# Entry context and credits: scenario 13 September 2026

Read-only audit of the seed executed 29 September, 13:12:40–13:17:04 UTC. No paid requests or product changes. Sources: frontend/backend `.tmp/context-audit-2026-09-29.jsonl`, backend review entry files 005–008 and dialog 009, provider usage. Reproduction: `.tmp/day13-context-inspect.cjs`.

## Actual provider usage

Main model: qwen3.8-max. Input includes cached tokens; outputs are provider-reported billed output. Credits are logged `chargedCredits`, not a new estimate.

| Entry (local time) | Input | Cached input | Output | Main credits | Helpers incl. embeddings | Cycle total |
|---|---:|---:|---:|---:|---:|---:|
| Before picnic, 11:30 | 11851 | 0 | 879 | 291 | 18 | 309 |
| After picnic, 14:20 | 12302 | 2048 | 834 | 262 | 21 | 283 |
| Completed expenses, 15:10 | 12305 | 2048 | 785 | 259 | 18 | 277 |
| Endurance milestone, 17:00 | 12434 | 2048 | 1113 | 280 | 23 | 303 |
| Total | 48892 | 6144 | 3611 | 1092 | 80 | 1172 |

Helpers: user-memory extraction 28, assistant-memory extraction 45, embeddings 7 credits. Main entry input charges total 873 and output charges 219. Only 12.6% of the four initial requests' input was cached.

The single follow-up to the last entry had input 13105 = 11264 cached + 1841 fresh, output 794. Main reply cost 113 plus dialog memory extraction 13 = 126. Entries plus this dialog: 1298. Daily report cost another 286, making the observed subtotal 1584; this does not establish complete independent check-in embedding coverage. Weekly generation failed before a paid weekly response in this run.

## Actual context selection

Frontend retrieval used relevant_only with similarity threshold 0.6. Eligible semantic candidates by entry: 0, 0, 1, 0. The initial retrieval budget was filled with recent fallback records. Linked-plan assembly/rebudgeting then produced these final provider records:

| Entry | Final history records | Linked reason | Recent reason | Original representations |
|---|---:|---:|---:|---:|
| Before picnic | 14 | 3 | 11 | 8 |
| After picnic | 15 | 4 | 11 | 8 |
| Expenses | 15 | 4 | 11 | 7 |
| Endurance | 15 | 4 | 11 | 6 |

All final records were found in actual provider RELEVANT_ENTRY_DIGEST blocks, with no duplicate entry IDs. Linked-plan ID references are not duplicate body copies. Each request retained four historical dialog turns attached to their original sources. Current entries were separate from previous-entry bodies. No future-dated history was observed in these four snapshots.

Common history: prior walking recovery and lapse, screen-pause trial, expense preparation, post-work completion/pressure, anxiety check-in, and recent morning/evening check-ins. The first request reaches back to September 9; the second also fits a September 8 original record. The third and fourth include earlier same-day entries. This is primarily linked + recent selection, not a strong semantic shortlist.

Each request includes six planning entities: endurance goal, completed picnic checklist, walking habit, screen-pause habit, expenses task, picnic occurrence. Task completion updates in the 15:10 context; the goal's first stage is complete (1/3) at 17:00. Event occurrence day and current/previous linked entry references are present. Habits carry recent daily values and period statistics. The event remains scheduled in persisted data; attendance must come from the user's entry, not an inferred status transition.

The first picnic request already includes the unrelated expenses task and screen-pause habit. Its response offers to finish expenses after the picnic. This illustrates how broad planner context can divert a focused entry response, even when the underlying facts are correct.

## Size and avoidable overhead

Per-section values are local qwen_estimate figures, not exact provider tokenization. Provider totals above are authoritative. Reconciliation adjustments for the four requests are -957/-777/-787/-765 tokens.

- System prompt: 3956 estimated tokens; RESPONSE_TASK: 675; combined instruction-bearing messages: approximately 4631, not the discussed future 2500.
- Planning JSON: 2015–2129 estimated tokens. The usage report misleadingly labels it as memory instructions/wrappers.
- Previous records/check-ins: 5677–5920 estimated tokens, close to the 6000 history budget.
- Current entry including metadata/metrics: 304–393 estimated tokens. Raw authored text is only 117–207 characters.
- Morning/evening check-ins correctly use original answers without nonexistent AI analyses, but repeat template/title/mood/metric labels inside and outside their original text.
- Walking-habit description contains a repeated sentence. Some historical original titles still contain HTML markup.
- Review summaries show zero relevant capsules and null current metrics despite actual provider messages containing both history and metrics. Use provider.messages.prepared as the source of truth; reporting discrepancy remains unresolved.

## Recommended next work (not implemented)

1. Enforce the eventual whole-request budget across system/task instructions, planning, source, memory, and dialogue; a 6000 history budget alone does not enforce a 9000 request ceiling.
2. Inspect semantic scores/eligible filtering on these short seeded entries before changing threshold 0.6; zero eligible candidates alone does not prove an embedding defect.
3. Bound recent fallback instead of automatically filling remaining space to 6000; reserve detailed history for direct links, relevant situations, outcomes, and counterexamples.
4. Select plan details by the current entry, preserve explicit links, and compact unrelated planner summaries.
5. Remove redundant serialization and instruction repetition before removing useful facts. Validate against these four responses and the seven-day scenario.
6. Repair review-file diagnostics separately so counts/metrics reflect the actual sent prompt.
