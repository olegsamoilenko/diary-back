# September 8 seed: capsule and response audit

Status: observations only, second day of the user-approved September 7–9 comparison batch. Do not change prompts or launch paid replays before collective review. Base activity is the agreed workload; do not extrapolate tariff viability from these two days.

## Evidence and completion

- Scenario `daily-scenario-2026-09-08-v1`; frontend run 2026-09-30 07:28:09.802Z–07:33:22.529Z (10:28–10:33 Europe/Kiev).
- All 13 steps completed; four saved sources, four dialog turns, daily report completed; no scenario failure.
- All 17 generation operations ended with `stop`; six embeddings make 23 usage rows.
- Diagnostic sources: both repositories' `.tmp/context-audit-2026-09-30.jsonl`, backend `.tmp/nemory-ai-full-2026-09-30.jsonl`, read-only local `token_usage_history`.
- Usage query window 07:28:05Z–07:33:32Z allows for frontend/server clock skew and log delivery. Actual rows run 07:28:11.603Z–07:33:18.551Z.
- Daily trace: `2893d875-293d-459b-bf8e-04f959057381`.

No app/prompt changes, data mutations, device actions or paid model calls were made for this audit.

## What actually reached context

Entry history contains five unique sources: September 7 morning, entry with two dialogs, anxiety check-in with two dialogs, bedtime, and September 8 morning. Anxiety history adds September 8 entry with its two dialogs, for six unique sources. There are no future September 8 bedtime observations in either initial context.

Routine sources are explicitly named morning/evening check-ins and retain original Q&A. All metadata uses compact metrics; no duplicated SOURCE_OBSERVATION headers or verbose metric-scale fields were found in retrieval text. Both contexts report `relevant_only`; estimated memory sizes 3427 and 4759 tokens are not exact Qwen provider counts.

Both initial context readbacks are identical. All four dialog reuse events contain the exact saved context JSON; actual cache hits were reported separately by the provider.

Day input contains all four sources at 07:35, 15:05, 16:30, 21:40 with their moods/metrics, four dialog capsules, and planning data. Existing task has two checked items and an unchecked verification/rehearsal item, status todo, deadline September 9 16:00. Habit is 20/30 minutes, partial; cumulative progress is one completed and one partial day. All three goal stages remain pending. The reminder was moved to September 8 12:30; its planner completion is unknown, while the entry confirms the actual call at 12:35.

`previousAnalyses` contains exactly the September 7 daily capsule (the saved 1357-token original). It is background, not another source day in the September 8 snapshot. This also carries forward the known September 7 capsule errors. No backend personal-report storage is inferred from transmission.

## Entry/check-in capsules

**Preserved:** partial versus total task completion, exact deadline, figures arriving after the call, the actual call to mother, warm feelings coexisting with anxiety, bodily tension, avoiding unnecessary rework, the five-extra-slides impulse and the three-question plan. Source moods and all numeric metrics survive in deterministic headers.

**Repeated timestamp defect:** entry source `12:05Z` is **15:05 Europe/Kiev**, but generated prose calls it 12:05 Europe/Kiev. Anxiety source `13:30Z` is **16:30 Europe/Kiev**, but prose calls it 13:30 Europe/Kiev. Correct outer metadata does not remove these contradictions. The September 7 entry's wrong local-time prose also reaches September 8 history.

**Remaining auxiliary-input duplication:** anxiety Q&A appears in both original rendered text and `structuredContext.answers`; source mood/metrics also appear twice. Main retrieval metadata compactness does not mean this separate Luna request is deduplicated.

**Size observation, not an automatic defect:** using the same local `o200k_base` tokenizer for original and capsule prose:

| Source | Original content tokens | Capsule prose tokens | Stored digest including metadata |
| --- | ---: | ---: | ---: |
| Entry | 358 | 368 | 451 |
| Check-in answers only | 146 | 205 | 283 |

These are local text measurements, not billed provider output. Check-in comparison excludes original questions/template/metrics to compare authored answers with generated prose. Explicit dates and attribution take space; this run shows fact structuring rather than substantial compression of short sources. Do not reduce fidelity merely to force a ratio.

## Response and dialog capsules

Response capsules generally preserve distinct explanations and proposals. Attribution is useful: they explicitly mark psychological explanations as Nemory interpretations and advice as unconfirmed. Entry response content compresses from 581 to 388 local tokens; check-in response from 375 to 311 (prose only, excluding JSON).

New dialog distortion: at 15:12 the user retrospectively says the split into six ready slides and two dependent on another person helped. Its capsule says the other two **still depend** on that person. By 14:25 the figures had already been inserted. The summary reintroduces a resolved dependency as a current state.

Other dialog capsules preserve the main outcomes: checking evidence instead of imagining disapproval, deciding not to apologize again, writing questions in a notebook, and accepting that an unknown answer can be clarified after the meeting. These useful outcomes are then partly lost in the daily capsule.

Secondary classification observation: source extraction puts a dated unfinished presentation task into `userMemory` with kind `vulnerability`. This is a transient task state rather than established personal vulnerability; track during collective memory/capsule review. The audit does not assert that this field was later retrieved as durable memory.

## Daily capsule and recompression

| Day | Initial tokens | Retry tokens | Requested reduction | Actual reduction | Selected | Capsule credits |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| September 7 | 1357 | 1215 | 34% | 10.5% | Original, over_budget | 51 |
| September 8 | 1167 | 1138 | 23% | 2.5% | Original, over_budget | 50 |

September 8 initial call: 7197 input / 1392 output / 32 credits / 11.710 seconds. Retry: 1395 input / 1221 output / 18 credits / 8.814 seconds. Output includes more than capsule text, including reasoning/JSON. Local tokenizer independently reproduced 1167 and 1138 text tokens.

Exact comparisons confirm first Luna received the same day payload as the main model (plus the main response separately); retry received only the first capsule; saved text equals first capsule exactly. No clipping or third request. Safety fallback works; budget compliance fails for the second consecutive observed day. Both rejected retries together cost 38 credits.

**Good daily preservation:** task remains incomplete despite eight assembled slides; walk is partial 20/30; goal stages are described as not marked complete rather than claiming no activity; the call is supported by user text while planner status remains separately unknown. The bedtime observations retain their correct 21:40 heading this time.

**Omissions already in the initial daily capsule:**

1. The 15:05 source observation disappears: mood 🙂, Energy 3/5, Focus 4/5, Stress 3/5, Motivation 4/5. It was present in input. Only morning, anxiety and bedtime measurements survive.
2. The entry-dialog result of rereading the message and deciding not to apologize without evidence is omitted, along with the concrete evidence-checking technique.
3. The anxiety-dialog acceptance that an unknown answer can be clarified after the meeting is omitted. This is meaningful for a subsequent weekly analysis of uncertainty, not merely incidental wording.

**Referent drift:** check-in response proposed adding one or two additional **questions** if they arise during rehearsal; its response capsule leaves the noun implicit. The daily capsule explicitly calls these one or two **slides**, despite the user's effort to avoid enlarging the presentation. The main daily answer also uses an ambiguous one-or-two reference; this audit cannot uniquely assign the drift to one intermediate step. Preserve explicit nouns in future collective correction.

**Chronology:** the 07:35 heading also includes moving the reminder, which the scenario executes at 08:03; the morning source states intent to move it. The capsule combines intent and subsequent completion rather than dating them separately. Later confirmed dialog outcomes are grouped under 16:30 without exact dialog times. Less severe than the source UTC errors, but relevant to temporal fidelity.

**Retry:** most content remains, explaining the tiny reduction. It strengthens the user's qualified statement that extra slides *may* only expand work into a statement that they *will* expand it. Missing metrics/dialog outcomes cannot be recovered because the retry has only the already-incomplete first capsule. Retry text was not selected.

## User-facing answer quality

The entry answer uses previous-day context and concrete details; dialogs answer the actual questions, and the requested single-action anxiety dialog stays concise. The daily answer is readable, includes the call and walk, recognizes the partial habit, and notices the shift in anxiety from missing figures to client questions.

Accuracy concerns to carry into the collective response review:

- Entry response claims bodily tension was noticed earlier than yesterday; source timing does not establish that comparison.
- Entry response claims today's chat-muting technique was not used. Absence from today's text does not prove non-use.
- Entry response says there is a full workday free of blockers before a 16:00 deadline; the whole schedule is unknown.
- Daily response says yesterday's reactivity was reduced by the walk, and contrasts today's action-based relief with yesterday's fatigue-based relief. Those causal distinctions are not demonstrated by the sources.
- Daily response says leaving the phone in the kitchen works for sleep; one night with improved sleep is an observation, not proof of the cause.
- Daily response calls the walk the first goal stage, although stage completion remains pending. It can be framed as progress toward that stage, not its established achievement.
- Daily response does not emphasize the confirmed ability to defer an unknown answer and the no-extra-apology decision; these would add grounded depth more usefully than unsupported causal claims.

## Actual usage ledger

| Work | September 7 credits | September 8 credits |
| --- | ---: | ---: |
| Entry response | 168 | 246 |
| Check-in response | 167 | 215 |
| Four dialog responses | 292 | 301 |
| Main daily analysis | 247 | 276 |
| Source/response/dialog capsules | 113 | 116 |
| Daily capsule, both attempts | 51 | 50 |
| Six embeddings | 6 | 6 |
| **Total** | **1044** | **1210** |

Increase: 166 credits, approximately 15.9%. Cumulative two-day usage: 2254 credits; mean 1127/day. This is actual seeded activity, not a monthly price projection.

September 8 total input: **96,392**, including **40,948 cached reads**. Input excluding cache reads: **55,444**, comprising 53,272 ordinary input and 2,172 reported cache writes. Output: **14,488**, including reasoning. Do not add cache reads/writes again to total input.

Main provider inputs: entry 8090; its dialogs 8918 and 9514; anxiety 9518; its dialogs 9862 and 10084; daily analysis 8552. Dialog cache hits respectively 6272, 8448, 8448 and 9216. Theoretical 9000-token examples discussed in chat must not be presented as an enforced current limit. Per-block Qwen token estimates differ from provider counts and are not billing measurements.

## Handoff

Keep prompts unchanged for day 3. Next: user-run September 9, audit against these findings and [September 7](day7-compression-audit-20260929.md), then jointly prioritize one correction batch. Track missing measurement observations, temporal state/uncertainty, explicit referents, preservation of dialog outcomes, and compression effectiveness separately. Continue accumulating real credits through weekly/monthly scenarios before tariff conclusions. Memora handoff: 2728; backlog index: 2564.
