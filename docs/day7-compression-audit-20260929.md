# September 7 seed: two-pass capsule audit

Audited 2026-09-29 run, 20:05:49.284Z–20:11:14.633Z (last frontend log received 20:11:23.692Z). Scenario: `daily-scenario-2026-09-07-v1`. This is the latest run, not earlier September 7 runs in the same files.

Evidence: frontend and backend `.tmp/context-audit-2026-09-29.jsonl`, provider usage records, and a read-only query of local `token_usage_history` for this run window. No provider calls, seed reruns, application changes or data mutations were made for this audit.

## Result

All 16 scenario steps completed. Four entries/check-ins were saved, with four follow-up dialog turns. The daily report completed; its capsule status is **over_budget**, not ready within budget.

The comparison event is `capsule.day.comparison`, trace `ecb92b2c-f45c-474b-8d6a-77d91970173a`. Both complete texts are present in the diagnostic file. Saved capsule text is byte-for-byte equal to the first pass.

| Pass | Capsule tokens | Provider input | Provider output including reasoning/envelope | Credits | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| Initial Luna generation | 1357 | 6018 | 1494 | 31 | Complete, over 1000-token ceiling |
| Luna recompression | 1215 | 1585 | 1279 | 20 | Complete, still over ceiling; not selected |

Requested reduction: 34%, targeting about 900 tokens. Actual reduction: 142 tokens, **10.5%**. Both calls ended with `stop`, not truncation. First text: 3678 characters; second: 3249. Capsule generation total: 51 credits.

The second request contains only the original capsule plus compression instructions. Exact equality checks confirmed that the first Luna pass received the same day context as the main model, and the retry user payload contained only `{capsule: firstPassText}`. The first pass additionally receives the main analysis response.

The fallback works: a failed budget check no longer discards the capsule or aborts the scenario. The compression instruction itself did not achieve its target. Retaining an oversized capsule protects content but does not enforce the eventual weekly context budget.

## Meaning preservation

The second pass retained most main topics, mood and metric values, the walk, work dependencies, next-day plans and the distinction between AI suggestions and observed results. It nevertheless introduced semantic changes:

- First: part of the figures **may** arrive only after lunch. Second: part **will** arrive only after lunch. Uncertainty became certainty.
- First: Olena confirmed the proposed plan. Second: “Olena's plan.” Agreement became attribution of the plan to another person.

These two changes were not persisted, because the retry was rejected. There is no defensible numerical percentage for preserved meaning; 10.5% measures token reduction only.

Issues already present before recompression:

- The source entry timestamp is `2026-09-07T12:10:00.000Z`, or **15:10 Europe/Kiev**. Its generated user digest incorrectly calls 12:10 local time. The deterministic source header and main context time are correct, but prose contradicts them.
- The day capsule places evening mood and Stress 2/5 under a **19:00** reminder block. Those observations belong to the **21:45** bedtime check-in.
- A 10:00–10:30 meeting block also incorporates later dialog outcomes without distinguishing their times. The retry changes the heading to 10:00–13:00 but still mixes later information into it.
- Pending goal stages become “5 km and 10 km were not walked.” A pending/unconfirmed completion is not proof that an activity never happened.
- The receipt and not-yet-counted expenses are retained in the entry capsule but omitted from the initial day capsule. This omission did not originate in the second pass.
- The entry capsule changes “checked one example” to “finished/refined one example.” This is a smaller but real action-level distortion.

## Context and metrics

Confirmed day input: morning 07:40, entry 15:10, anxiety check-in 16:40, bedtime 21:45; two dialog turns for the entry and two for anxiety. Also present: one goal, one habit, one event, one task with checklist, one reminder and the recorded walk. `previousAnalyses` is empty.

Metrics are compact strings, not objects with repeated scale labels. All four observations have their own mood/metrics; they are not supplied as aggregate daily measurements. Source observation headers are not duplicated in the retrieved entry/check-in context. Morning and bedtime have no separate AI response/capsule generation charges.

Remaining duplication: the anxiety **Luna source-extraction input** includes the same questions/answers in both `original` text and `structuredContext.answers`; mood/metrics are also represented in both. This finding concerns the auxiliary extraction request, not a claim that all main-model prompts duplicate those questions.

## Main daily response

The response is readable and uses concrete events: narrowed presentation scope, communication with Olena, closed laptop, walk, postponed call. It connects actions with relief rather than merely retelling the day.

Its certainty is sometimes too strong for one day: “learned to act” and a generalized statement about how the user's anxiety works. The recommendation assumes 13:00 is an active period without supporting evidence. Sleep, numeric metric changes and expenses are not explored. The physical endurance goal is used as an emotional-resilience metaphor; this must not be treated as measured goal progress.

## Actual credits

Read from local `token_usage_history`, 23 rows in this run window:

| Work | Credits |
| --- | ---: |
| Entry response | 168 |
| Anxiety check-in response | 167 |
| Four dialog responses | 292 |
| Daily analysis response | 247 |
| Entry/check-in source, response and dialog capsules | 113 |
| Initial daily capsule | 31 |
| Daily capsule recompression | 20 |
| Six embeddings | 6 |
| **Total** | **1044** |

Main daily response: 7543 input, 1584 output, 247 credits. Daily response plus both capsule calls: 298 credits.

Entire run: 73,178 input tokens, including 27,124 cache reads; 46,054 input tokens were not cache reads (2,172 of those were reported cache writes). Output: 15,246, including provider reasoning. These are actual run totals, not a monthly extrapolation or a ChatGPT subscription estimate.

The logged per-block Qwen token counts remain estimates. Example: first entry estimate 6223 versus provider actual 4503. Do not present the estimated block sizes as exact or add cached input a second time to total input.

## Next recommended work

**User decision at session end, 29 September:** these are observations for a collective review, not authorization to fix them now. First complete and audit September 7–9 with unchanged prompts; then discuss, tune and repeat. Keep tracking source, response, dialog and day capsules. Current workload is evaluated as Base activity (three analyses with dialogs according to the scenario); approximately 1000 credits/day is provisionally acceptable. Evaluate the tariff only after a couple of weeks including weekly and monthly analyses. Resume with September 8–9 evidence, not immediate prompt edits. Persistent handoff: Memora 2728; backlog index 2564.

1. Keep timestamp rendering deterministic and prevent generated prose from inventing local times or attaching observations to another event's time.
2. Preserve uncertainty, agency, completion evidence and distinct topics in compression; fix the auxiliary check-in duplication.
3. Refine compression around explicit fact blocks and elimination of repetition. This run does not support assuming that a percentage instruction alone reliably enforces a token ceiling.
4. Recheck a subsequent authorized seed against the same comparison event and actual usage ledger. No prompt or application changes were made by this audit.
