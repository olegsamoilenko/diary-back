# Lite Sep23 audit — responses and capsule fidelity

Read-only review of user-run Sep23, Terra entry/two dialogues and manual daily summary. Evidence: front/back `.tmp/context-audit-2026-10-03.jsonl`, actual provider-prepared input/output, final persisted context and usage. No runtime/prompt edits, paid replay or journal mutations.

## Response quality

Entry response usefully separates a real pause locating a source from the global interpretation that the demonstration failed. It explains selective attention to uncertainty, discounting concrete positive feedback, and the possible reassurance function of an unsolicited follow-up email. It gives a narrow actionable lesson: prepare source links. The reference to the earlier fear of freezing is supported by the supplied Sep21 entry/dialog history.

Dialogue1 offers a clear explanation of why an embodied reaction can feel more persuasive than external feedback, plus a way to keep acting while uncomfortable. However, "не зірвався в поспішні вибачення" asserts an absence of apologies not stated by the user; the user said they said "секунду", looked through files, blushed and nobody laughed. Do not invent successful behavior while supporting the user.

Dialogue2 obeys the request for one concrete action: ask Iryna about practical use rather than praise. It explicitly allows "not tried yet". Its final claim that this necessarily means lack of opportunity is too narrow: lack of use does not itself establish either the reason or the quality of the demonstration. The proposed question also initially presupposes use, though the following explanation mitigates that.

Daily summary describes a supported Sep21→Sep23 shift from anticipated failure to actually completing the demonstration. It handles Marta's limited immediate attention more carefully than Sep22's photo analysis: acknowledges the user's need to share something important, accepts the partner's timing constraint, and incorporates the later conversation without declaring all hurt resolved. Practical request for time is useful. Opening with "one and the same sensitivity to evaluation" is stronger than warranted across two different needs (competence assessment versus emotional sharing), but the later explanation makes this distinction more clearly.

## Confirmed capsule error

Source evening check-in: "Боулінг, домовилися повернутися після гри".

Saved Luna day capsule: "Домовилися повернутися до теми після завтрашнього боулінгу."

Neither the current-day snapshot nor user-facing analysis supplied to Luna contains a plan to revisit the discussion after bowling. Luna added the object "до теми", turning the stated after-game return into a new interpersonal agreement. This is a material factual error in reusable memory, independent of the generally useful visible response. It occurred in the first capsule generation, not a retry. The earlier evening conversation had already occurred according to the check-in. Do not silently alter stored data during this audit.

Other capsule content preserves the completed task, real12-minute demonstration, help locating the source, ongoing urge to email without confirmation of sending, actual post-dinner conversation and reduced but not absent hurt. No fabricated completion of the suggested query to Iryna. Brief memory113tokens, above intended50–100 range, without the bowling error.

## Final context verified at provider

Initial retrieval9sources6707/6000:5 fresh check-ins Sep21–23 plus relevant sources Sep10/21/7/14 (scores0.659–0.691). All9 reach final persisted context and provider request; all5 daily briefs Sep7/10/14/21/22 also reach the provider. This time no source disappears at final planner assembly. Rendered record order is chronological. No active commitments or selected long-term user memory. The6707 measurement is the initial selector's budget measurement, not a newly measured final total after planner annotations.

Day current3736 plus daily capsules Sep19–22 =8215/7500; accepted whole-final-capsule overage715. No weekly capsule. All four Terra calls received the approved shared mechanism/history wording. Luna receives current snapshot and user-facing analysis without previousAnalyses.

## Cache/compression

Both follow-ups8minutes apart reuse the saved snapshot. Dialog1 cached10417/12264 (84.94%); dialog2 cached11556/12681 (91.13%). Growth1139 equals first-dialog cache-write count.

User337tokens retained verbatim under short-original policy. Assistant628→561 (10.7% reduction), a weak compression result. Day capsule1113tokens, one pass27credits, below1200 retry threshold; no second pass. Meeting size policy does not establish semantic accuracy: see confirmed bowling error above. Sep20 weekly recompression issue remains untested/open.

## Covered usage

| Operation | Input total | Cached read | Cache-write subset | Output incl reasoning | Credits |
|---|---:|---:|---:|---:|---:|
| Entry |11428|0|10417|864|385 returned|
| Dialog1 |12264|10417|1139|333|104 calculated|
| Dialog2 |12681|11556|1042|153|70 calculated|
| Daily Terra |10802|0|10799|953|386 derived|
| Daily Luna |6392|0|0|1161|27 returned|
| Total |53567|21973|23397|3464|972 covered/calculated|

Frontend day aggregate413credits,17194input,2114output. Dialog credits use actual provider token classes and configured rates, not independently reconciled wallet records. Standard input8197; cache reads21973; cache writes23397 included in total input. Non-cache-read input31594. Embeddings and helpers outside these five events excluded. Audit launched no paid model calls; coding-agent usage unavailable.

## Next

Keep visible-response prompts while gathering evidence. Prioritize memory compression fidelity (added agreement here; impulse-to-action conversion in Sep20 weekly retry) along with weak compression ratios. Any corrective implementation or stored-data repair requires a separate authorized task; current request is analysis only.
