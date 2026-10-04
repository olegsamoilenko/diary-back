# Lite Sep20 and week Sep14–20 audit

Read-only review of the user-run seed and manually generated day/week summaries on 2026-10-03. Sources: front/back `.tmp/context-audit-2026-10-03.jsonl`, actual provider messages/results, retrieval decisions and frontend responses. No paid replays or runtime/prompt edits.

## Response quality

All five Terra calls received the approved plain-mechanisms and required-history instructions.

The entry explains the possible function of filling free time with tasks (reducing uncertainty/control), its cost to rest, and a practical check for concrete urgency. Readability is better than Sep18. However, its historical comparison remains generic/current-source-derived even though relevant Sep11/12/15/16/19 records were supplied. It does not independently describe a dated prior episode. Dialogue 1 does: it compares concrete episodes, separates repeated actions from unproven stable change, and correctly uses supplied planner totals (walking 11 complete/2 partial/1 missed out of14; screen pause2/8 completed periods). Dialogue 2 offers concrete choices and explains why they help. It overstates the counterfactual that a normal walk restored rhythm better than a double dose; only the normal walk was observed.

Daily analysis correctly counts a single30-minute walk, preserves the uncompleted5km stage, links Sep16/19 and gives next steps. It still has unnecessary abstraction ("регулювати себе", "одноосібно") and some claims of mechanism weakening that are stronger than one day's observation.

Weekly analysis integrates work, relationships and movement; uses previous-week comparison and preserves the distinction between persistent impulses and changed actions. It is readable and useful, but "домовленість ... спрацювала саме тому" asserts an unverified exclusive cause. "Недосип ... зменшив запас терпіння" is also more definite than source attribution. These warrant continued observation, not another unrequested prompt rewrite.

## Actual context

- Entry:12 sources,6035/6000 tokens:5 recent check-ins Sep18–20 plus7 relevant sources (score0.674–0.771) from Sep11/12/15/16/19/20. The earlier same-day13:30 entry is included. No selected user long-term memory or active commitments. Four short daily memories (Sep11/15/18/19) survive into the final assembled context, not only retrieval output. Short sources are originals by policy; not all12 are compressed capsules.
- Dialog1 reuses the snapshot. Dialog2 refreshes to13 sources6431/6000, adding Sep9 evening and reranking other sources.
- Day:current day3542 tokens plus daily capsules Sep16–19, total7865/7500.
- Week:all7 daily capsules Sep14–20, no missing day; base7830 tokens. Previous week Sep7–13 included, total9927/9500.
- Overages follow approved whole-last-source soft limits.

## Cache

Source time16:30; question1 at16:38 (8minutes); question2 at17:10 (32minutes after question1). Frontend decision logs show1920000ms idle vs1800000ms threshold and explicit refresh reason `question_gap_or_clock_change`. This is simulated seed time, although requests arrived seconds apart in real time.

Dialog1:9642/11417 input tokens cached (84.5%). Dialog2:0/12198 cached,12129 cache-write tokens. This follows the intentional refresh; this seed does not test two consecutive follow-ups within the30-minute window.

## Capsules and precision findings

- User source352 tokens:verbatim `short_original`, no unnecessary compression call. On refreshed query381 tokens, same policy.
- Assistant entry memory585→463 tokens (20.9% reduction).
- Day1099 tokens, one Luna pass27credits; below1200 retry threshold. Its capsule includes concise useful dialogue advice and correctly attributes it to Nemory. Short day memory112 tokens, slightly above intended50–100 range.
- Week first2214, second2050 tokens:only7.4% reduction despite56% requested. Target1100, selected pass2, saved `over_budget`; no third pass. First51credits, repeat34credits, total85. Pipeline preserved the accepted shorter repeat rather than dropping the analysis, but the compression is ineffective.
- Concrete semantic regression in second week pass: first says the user stopped the desire to prove who was more tired; second says they stopped proving it. A restrained impulse becomes an already-started action. This deserves priority in compression evaluation.

## Usage ledger

| Operation | Input total | Cache read | Cache write subset | Output incl reasoning | Credits |
|---|---:|---:|---:|---:|---:|
| Entry |10652|0|9642|799|358 returned|
| Dialog1 |11417|9642|1095|773|154 calculated|
| Dialog2 |12198|0|12129|604|378 calculated|
| Day + capsule |16504|0|10449|1861|380 returned|
| Week + two capsule passes |24801|0|12543|6312|570 returned|
| Total |75572|9642|45858|10349|1840 covered/calculated|

Dialog charges calculated from current repository rates and provider-reported token classes, not independently reconciled to wallet rows. Standard input20072, cached read9642, cache writes45858; input not served from cache65930. Cache writes are included in total input, not additive. Ledger excludes embeddings and helper calls absent from these8 provider usage events. No new paid AI calls were launched for this audit; coding-agent token/quota usage unavailable.

## Next

Keep current response prompts for further testing. Prioritize the ineffective weekly re-compression and preservation of impulse/action distinction. If testing growing cache specifically, use a separate pair of follow-up questions within30minutes of simulated time; do not interpret this intended32-minute refresh as a cache regression.
