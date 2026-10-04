# Lite Sep21 seed audit — Terra

Read-only audit of user-run Sep21 on2026-10-03. Evidence: current front/back `.tmp/context-audit-2026-10-03.jsonl`, actual prepared provider messages, returned responses, retrieval and capsule events. No prompt/runtime changes or paid replay.

## Quality

This is a stronger assistance test than Sep20: the main entry asks how to prepare for a short demonstration while doubting the material; it does not supply a resolved course of action. Terra explains a plausible shift from producing a useful document to trying to demonstrate competence publicly, and how selecting a harder example can temporarily reduce uncertainty while expanding preparation. It gives a concrete input/grouping/result explanation structure and a rehearsal. The first dialogue gives usable pause phrases and a way back to the document when flustered. The second distinguishes a colleague's friendly intent from the user's comparison with their speaking style, without insisting on hostile intent. These are useful, readable responses with mechanisms and actions.

Remaining limitations:
- The initial entry still calls scope expansion familiar without naming and comparing a concrete past episode, despite supplied Sep7/14/15 work sources. Shared history instructions reached all Terra calls, but compliance in initial responses remains weaker than in summaries/dialogues.
- Dialogue2 unnecessarily says it had no grounds to assume otherwise about the colleague. The preceding responses did not explicitly accuse him of humiliation. The user clarified context; no prior accusation needed to be implied.
- Daily analysis usefully compares wanting a more impressive example with wanting a more impressive walking distance on Sep19. It then describes both as wanting not to look inadequate. The latter common motive is a hypothesis; the walking source does not establish a public-evaluation motive.
- A single10-minute rehearsal is a practical stopping criterion, not proof that preparation is sufficient in every circumstance. Do not turn this into a universal rule in memory.

Daily summary also addresses the evening's three-file indecision and partner boundary; recommends selection criteria grounded in the actual alternatives. It retains that no example has been selected and no suggested rehearsal is yet completed. No weekly analysis ran this time.

## Actual context and cache

- Entry retrieval10 sources,7074/6000 tokens:5 fresh check-ins Sep19–21;5 relevant work records from Sep14(two),Sep7,Sep10,Sep15, scores0.651–0.712. The accepted soft limit allows a whole final source even with1074 overage.
- Six short day memories Sep7/10/14/15/19/20 confirmed in the final assembled prompt. No active commitments or selected user long-term memory. These sources include originals, not exclusively compressed capsules.
- Both follow-ups occur8minutes after the preceding source/question (15:10→15:18→15:26); no context refresh. Dialog1 reads10812/12575tokens (86.0%); dialog2 reads11875/13066 (90.9%). The second read exactly includes the first read10812 plus first-dialog cache-write1063. This supports growing cache behavior for this run.
- Day current3765 tokens plus previous daily capsules Sep17–20 =8187/7500, allowed687 overage. No weekly capsule included.

## Capsules

User source346tokens retained verbatim under short-original policy. Assistant memory542→422tokens (22.1% reduction). Day capsule1093tokens, one pass29credits, below1200 retry threshold; no needless second pass. Short day memory99tokens. Luna receives current snapshot and user-facing analysis, with no previousAnalyses array.

The day capsule preserves the clarification that the joke was friendly, pending example choice, uncompleted task items, temporary relief during the walk, partner's offer for tomorrow, and attributes dialogue recommendations to Nemory without claiming execution. No equivalent impulse-to-action regression to yesterday's week recompression was found in this capsule review.

## Covered usage

| Operation | Input total | Cached read | Cache write subset | Output incl reasoning | Credits |
|---|---:|---:|---:|---:|---:|
| Entry |11833|0|10812|796|387 returned|
| Dialog1 |12575|10812|1063|393|111 calculated|
| Dialog2 |13066|11875|1095|416|104 calculated|
| Day Terra |10774|0|10771|843|372 derived|
| Day Luna |6286|0|0|1254|29 returned|
| Total |54534|22687|23741|3702|1003 covered/calculated|

Day frontend aggregate401credits,17060input,2097output. Dialog credits calculated using current configured rates and actual provider token classes, not independently reconciled with wallet rows. Standard input8106, cache read22687, cache writes23741 (not additive to total input); uncached input including writes31847. This excludes embeddings/helper costs not present in these five usage events. Audit launched no paid AI calls; coding-agent token/quota usage unavailable.

## Decision

Continue testing the current response prompt. This run demonstrates concrete help with unresolved uncertainty and growing dialog cache. Track precise historical attribution and unnecessary concessions without expanding prompts now. Weekly recompression effectiveness/semantic fidelity from Sep20 remains outstanding; this day did not retest it.
