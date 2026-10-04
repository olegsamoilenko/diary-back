# September 9 audit and three-day capsule review

Status: the requested September 7–9 evidence batch is complete. Findings and proposed correction priorities only; no application/prompt changes or paid replays.

## Latest run

Scenario `daily-scenario-2026-09-09-v1`, run on 2026-09-30, frontend 07:52:16.024Z–07:55:25.051Z, last log received 07:55:32.006Z. All **11/11** steps completed with no scenario failure. Ten generation operations ended with `stop`, plus four embeddings. Main model Qwen3.8-max; auxiliary capsules GPT5.6-Luna.

This day has **one analyzed entry, two dialogs and one daily analysis**. Its morning/bedtime sources have no AI response. Unlike September 7–8, there is no additional analyzed anxiety check-in or its two dialogs. Lower daily credits must not be interpreted as cheaper equivalent activity.

Evidence: both `.tmp/context-audit-2026-09-30.jsonl` files, backend `.tmp/nemory-ai-full-2026-09-30.jsonl`, and a read-only local `token_usage_history` query for 07:52:10Z–07:55:33Z. Small window margins accommodate frontend/server clock skew; actual rows run 07:52:15.036Z–07:55:21.445Z. Daily trace `06c35966-731b-4948-b4ec-9d3fea18e5ed`.

## Context, dates and reuse

- Entry retrieval includes eight unique previous sources: both September 7 routine check-ins and its entry/two dialogs; both September 8 routine check-ins, its entry/two dialogs and anxiety/two dialogs; September 9 morning. September 7 anxiety is not selected. Selection is `relevant_only`; this audit does not infer its exact exclusion reason merely from the final selection.
- All five eligible routine check-ins from the current and preceding two days are present with original Q&A, dates, named morning/evening roles and compact measurements. Today's evening is correctly absent from the afternoon request.
- No duplicate source blocks, duplicated SOURCE_OBSERVATION headers or verbose metric labels were found. Saved context readback is identical; both dialog reuse payloads exactly match it.
- Daily snapshot contains only September 9's three sources (07:40, 15:20, 21:40), two dialog capsules, completed preparation task, the separate next-day follow-up task, meeting and habit/goal evidence. September 8 and 7 daily capsules are separate `previousAnalyses` background.
- Existing preparation task is completed with all three checklist items checked; the new follow-up task is todo with all three items unchecked, starts September 10 09:00 and is due 15:00. Habit is 30/30 today, two complete days plus one partial day cumulatively; goal stages remain pending.

## Source and response capsules

The entry capsule preserves the meeting outcome, all three positive feedback points, exact follow-up deadline, distinction between completed presentation and planned follow-up, bodily sensations, mixed relief/rumination, stopped reassurance request and message to the partner. Its deterministic header retains source timestamp, mood and all four metrics.

Unlike September 7–8 examples, this new source capsule **does not invent a local timestamp in prose**. That is a successful sample, not evidence that the underlying prompt defect was fixed. Historical wrong timestamps still arrive inside earlier capsules.

Local o200k_base comparison: original entry 1003 characters / 349 tokens; capsule prose 1058 characters / 386 tokens; digest with metadata 469 tokens. Again, meaningful fact structuring does not significantly shorten these roughly 1000-character entries. This is not itself a mandate to remove facts.

The response capsule reduces 508 original prose tokens to 308 content tokens. It marks the explanation of post-meeting rumination as Nemory's hypothesis rather than an established fact and retains separate proposed actions. It avoids repeating several unsupported claims from the main answer.

Dialog summaries preserve the user's questions and decision to record three positive feedback points beside the unresolved question. However, the first dialog's response capsule retains three strategies but omits the answer's explanation of why an unfinished question captures attention (named in the original as the Zeigarnik effect). The contract is supposed to retain the essence of the answer, not only advice. Preserve a useful explanation as an attributed hypothesis; do not promote its confident original wording to established personal fact. No judgment about the scientific validity of that explanation is made by this audit.

The source's separate `userMemory` again classifies a dated pending work item as `vulnerability`; retain the September 8 classification concern for collective review.

## Daily capsule

First call: **1276 capsule tokens**, 7512 provider input, 1510 provider output, 35 credits, 13.173 seconds. Retry: **1187 capsule tokens**, 1504 input, 1299 output, 20 credits, 9.389 seconds. Requested reduction **30%**, achieved **7%**. Both finish normally. The saved report is completed but capsule is `over_budget`; original text is retained exactly.

Exact checks confirm that main model and first Luna pass receive the same day payload, Luna additionally receives the main answer, and retry receives only the first capsule. Independent o200k_base counts match both recorded lengths. There is no clipping or third attempt.

**Preserved correctly:** all three sources' mood/metric values; unknown next-morning condition; phone-at-kitchen as a plan for tonight, not an already performed action; presentation completed but promised client answer still outstanding; pending goal stage; positive feedback and notebook outcome. September 8's omission of the entry measurements did not recur here.

**New false system timestamp:** both capsule versions say the task was marked complete at 15:00 but its system completion timestamp is 11:00. Actual provider payload has `completedAt: 1788955200000`, which is **2026-09-09T12:00:00Z = 15:00 Europe/Kiev**. The source text also says 15:00. This is a model-generated contradiction, not inconsistent underlying data. The task's original start time is 11:00 on September 7, but the audit cannot prove that was the cause. Mixed human-readable and numeric timestamp representations should be addressed deterministically in the future correction batch.

The day capsule keeps all entry metric values but attaches them to the 14:00–14:40 meeting narrative without preserving their explicit observation time **15:20**. It also merges later confirmation with earlier intent. Future schema should distinguish event time from source/measurement time.

Retry preserves most facts but barely compresses. It changes the statement that they talked about more than work **on the walk** into a phrase following the **dinner** thanks, making the setting ambiguous. It removes some useful concrete wording, but does not fix the initial timestamp error. Retry was not selected.

## User-facing response quality

Strengths: main entry and daily answers connect preparation, actual meeting, follow-up and relief. Daily response accurately contrasts morning Stress 4/5 with later 2/5, treats the next client response as a separate task, and does not claim that tonight's phone plan or the goal stage are completed. Second dialog is short and directly supports the user's notebook decision.

Open concerns:

1. Entry and daily responses attribute the no-extra-slides/three-question plan to September 7; explicit three-question preparation is from September 8. Daily closing “three days ago” is imprecise relative to the September 7 start on September 9; “over these three days” would preserve the intended comparison.
2. Entry response says the actual question was not among the three prepared questions. Their contents were never supplied, so this is invented specificity.
3. Entry response presents success as caused by not expanding slides and explains rumination as a definite threat-system mechanism. These are stronger than the evidence. Daily response similarly treats a few episodes as an established pattern change.
4. First dialog declares a named psychological effect to be the personal cause, says the balcony action worked and that bodily actions work better than reasoning. Sources do not establish those individual effects or comparison.
5. First dialog proposes “tomorrow at 14:30” as the time to return to work, only 30 minutes before a 15:00 promise requiring another person's information and checking. That slot was not supplied or accepted and may be impractical. Entry response's “until then it is not my problem” also blurs resting now versus preparing before the deadline.
6. The user's question is how not to reduce the meeting to one unanswered question. The first answer mostly explains and manages rumination, despite three positive feedback points already present in the original entry. The second answer addresses balanced evidence only after the user repeats those points. Relevant information was available; retrieval absence is not the cause.

## Actual credits and tokens

| Work | Sep 7 | Sep 8 | Sep 9 |
| --- | ---: | ---: | ---: |
| Entry response | 168 | 246 | 257 |
| Additional analyzed check-in | 167 | 215 | — |
| Dialog responses (4 / 4 / 2) | 292 | 301 | 165 |
| Daily analysis response | 247 | 276 | 245 |
| Source/response/dialog capsules | 113 | 116 | 56 |
| Daily capsule including retry | 51 | 50 | 55 |
| Embeddings | 6 | 6 | 4 |
| **Total** | **1044** | **1210** | **782** |

Three-day sum **3036**, arithmetic mean **1012/day**, with unequal workloads as described above. No monthly pricing conclusion. The main day-9 report including capsule calls costs 300 credits.

September 9: **63,814 input** = 36,686 ordinary input + 27,128 cache reads; cache writes 0. Output **9675**, including reasoning. Provider inputs: entry10435; dialogs11182/11728; daily8980. Corresponding cache hits2048/9216/10496/1024. Main entry input has grown 4503→8090→10435 across the three days; memory estimates315→3427→5438 use a different measurement basis and must not be equated to exact provider token differences. Dialog cache helps, but does not make new history or output free.

Three-day combined ledger: input233384, cache reads95200, remaining input138184 (133840 ordinary +4344 cache writes), output39409. These are application usage, not Codex account usage.

## Three-day findings and proposed order for joint correction

| Day | First / retry tokens | Requested / achieved reduction | Selected |
| --- | --- | --- | --- |
| 7 | 1357 / 1215 | 34% / 10.5% | Original, over_budget |
| 8 | 1167 / 1138 | 23% / 2.5% | Original, over_budget |
| 9 | 1276 / 1187 | 30% / 7% | Original, over_budget |

**0/3 retries meet the ceiling.** Rejected retries cost **58 credits** total. Stored day capsules total **3800 tokens**, versus a three-day ceiling of3000 and nominal target2700. This is a small observed batch, not a universal model failure rate.

1. **Exact evidence first:** source/event/measurement dates, deterministic timestamp conversion, complete mood/metrics, uncertain versus confirmed, past versus current dependencies, explicit referents and owners.
2. **Meaning coverage:** retain important outcomes from user/assistant dialog, including explanations as attributed hypotheses, not only action lists. Protect the distinction between intentions, confirmed actions and AI suggestions.
3. **Then compactness:** remove auxiliary check-in duplication and repeated metadata/wording; revise the ineffective percentage-only retry using these same cases. Do not simply lower the output cap and truncate or increase the accepted budget to hide failure. Actual implementation remains for joint agreement.
4. **Response quality separately:** preserve short relevant dialog and supported cross-day connections; remove invented chronology, ungrounded causes and unsupported scheduling advice.

Continue the user's agreed Base testing and collect weekly/monthly evidence before tariff changes. Prior reports: [September7](day7-compression-audit-20260929.md), [September8](day8-capsule-audit-20260930.md). Memora2728; shared backlog2564. Next: discuss and agree the first correction batch, then rerun comparable cases; no automatic implementation or paid replay.
