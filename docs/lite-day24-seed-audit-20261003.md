# Lite Sep24 seed audit

Read-only review of user-run Sep24 (Terra entry, two dialogues and manual daily summary). Evidence: front/back `.tmp/context-audit-2026-10-03.jsonl`, provider-prepared inputs/outputs, final source IDs, capsule and usage events. No runtime/prompt/data edits or paid replay.

## Quality

Entry analysis concretely compares the planned5km outing with Sep19's impulse to extend the walk for a more convincing number. It separates the user's personal goal from a shared outing, proposes flexible route/check-in points, and preserves the partner's autonomy. Dialogues give usable wording both to clarify the partner's preference and to allow the user to turn back without abandoning the whole outing.

Daily analysis connects the result-focused attention during bowling to Sep23's focus on a pause during a successful demonstration. It gives a plausible mechanism for stronger throws/withdrawal after the joke, without declaring Andrii malicious or the user's hurt invalid. It proposes distinguishing what hurt and, if appropriate, communicating the effect without accusation. Advice remains concrete and readable.

Minor limitations: "буквально означает" assigns a definite intention to Marta's "побачимо по самопочуттю" before advising clarification; this should remain a plausible reading. The initial response's joking "хитра бухгалтерія руху" is unnecessary and could feel patronizing where the user already explicitly rejected counting bowling as walking. No broad prompt rewrite is warranted from these isolated wording issues.

## Previous capsule error exposure

The false Sep23 agreement to return to the discussion after bowling IS present in the actual Terra daily-summary input, as part of the Sep23 capsule. It is absent from entry/dialog inputs, which carry short daily memory rather than that full capsule. It was not repeated in any of the visible Sep24 answers or the newly generated day capsule. This is non-propagation in this run, not repair of the stored bad capsule or proof of no subtler influence. Stored data was not altered.

Luna receives only current snapshot plus user-facing analysis, no previousAnalyses. The false old agreement therefore did not enter Luna directly.

## Actual context

Initial entry retrieval:10sources5906/6000tokens, stopping with94 remaining under the200-token stop rule. Five fresh check-ins Sep22–24 and five relevant sources Sep19,Sep20(two),Sep11,Sep18 (scores0.715–0.795). All10 source IDs are in final rendered memory and provider messages; all6 brief memories Sep11/18/19/20/22/23 also arrive. No dropped/extra source in final assembly this run. No selected user long-term memory or active commitments. Initial5906 measurement is not a remeasurement after planner annotations.

Day current3603tokens plus daily capsules Sep20–23 =8137/7500, accepted whole-final-capsule overage637. No weekly capsule. All Terra calls contain approved mechanism/history instructions.

## Capsules/cache

User source344tokens retained verbatim by short-original policy. Assistant memory569→492tokens (13.5% reduction). Day capsule1200tokens exactly, one pass27credits: repeat threshold is strictly above1200, so no retry is correct. Nominal target900 is not a hard rejection ceiling. Brief92tokens. New capsule preserves partial25-minute walk, unfinalized Sunday route, unknown conversation with Andrii, actual departure at20:00 and continued mixed feelings. No material fabricated agreement comparable to Sep23 identified in this review; the interpretation of Marta's statement is slightly overcategorical in the capsule too.

Two8-minute follow-up gaps reuse saved context. Dialog1 cached9719/11510 (84.44%); dialog2 cached10805/12023 (89.87%). Growth1086 equals previous cache-write count.

## Covered usage

| Operation | Input total | Cached read | Cache-write subset | Output incl reasoning | Credits |
|---|---:|---:|---:|---:|---:|
| Entry |10736|0|9719|867|369 returned|
| Dialog1 |11510|9719|1086|408|110 calculated|
| Dialog2 |12023|10805|1115|386|99 calculated|
| Day Terra |10724|0|10721|959|385 derived|
| Day Luna |6181|0|0|1107|27 returned|
| Total |51174|20524|22641|3727|990 covered/calculated|

Frontend day aggregate412credits,16905input,2066output. Dialogue credits calculated using actual provider token classes/current configured rates, not independently reconciled wallet rows. Standard input8009; cached read20524; cache writes22641 are included in total input. Input not served from cache30650. Excludes embeddings/helpers absent from these five usage events. No new paid AI calls during audit; coding-agent usage unavailable.

## Next

Continue current response prompt. Keep Sep23 stored-capsule false agreement and Sep20 weak weekly recompression in the unresolved findings; this run did not fix or retest those mechanisms. Any data repair or compression changes should be handled as explicit implementation work, not silently during this audit.
