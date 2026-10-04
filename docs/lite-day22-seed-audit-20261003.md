# Lite Sep22 seed audit

Read-only audit of user-run Sep22 (Terra), two dialogues and manual daily summary. Sources: front/back `.tmp/context-audit-2026-10-03.jsonl`, prepared provider messages and actual replies. No runtime/prompt edits, paid replay or data mutations.

## Quality

Initial analysis now explicitly links the social overcommitment to Sep14's urge to accept excessive work before clarifying scope. The actual prior source supports the comparison and preserves that the Sep14 impulse was restrained. Mechanism and practical steps are clear: quick agreement can temporarily reduce social discomfort while creating unrealistic obligations; restore the partner's choice and state one's own availability. Dialog2 offers a specific acknowledgment and repair instead of an empty promise, and does not treat interest in bowling as approval of having been spoken for.

Weak spots:
- Dialog1 suggests "Побачимось наступного разу довше" while addressing automatic overpromising. This unnecessary new commitment is inconsistent with the goal; other offered phrases avoid it.
- Day analysis says selecting the work example happened because the user stopped using search to postpone colleagues' evaluation. The source only confirms selection at11:00, not the cause or subjective reduction of uncertainty. Plausible mechanism is promoted to fact.
- In the photography story the user explicitly offers two possibilities: wanting shared enjoyment or depending on approval. The day response mainly selects external validation and states that hearts made reactions the measure of quality. That underexplores a meaningful alternative. Its practical advice to name what one likes before sharing and delay checking is useful, but does not substitute for the missing distinction.
- The daily summary correctly preserves that Marta expressed discomfort, attendance details remain undecided, and Andrii's acceptance of the time boundary does not prove all future invitations will be pressure-free.

## Actual context: retrieval is not final delivery

Initial retrieval selected10 sources at6282/6000 tokens:5 fresh check-ins Sep20–22 and5 relevant sources (scores0.635–0.666):Sep21 evening entry, Sep18 main, Sep14 main, Sep11 main, Sep7 evening. It attached6 briefs Sep7/11/14/18/20/21.

Final persisted context AND provider messages contain only9 source IDs and5 briefs:Sep7 evening and its brief are absent. The final assembly in `db/services/linked-entry-response-context.service.ts` annotates planner links and calls the ranked budget selector again. This explains why reporting initial retrieval alone would overstate delivered context. Remaining source order is chronological in rendered memory. No added source outside those9 was found. No active commitments or selected long-term user memories.

This does not by itself show a request failure, but the extra selection pass remains relevant to the user's requirement that admitted sources should not be reshuffled/dropped later. Do not silently change that behavior during an audit. The6282 measurement belongs to initial retrieval, not the final rendered memory.

Daily context:current3655 tokens plus daily capsules Sep18–21 =8141/7500 (accepted whole-last-capsule overage641). No weekly capsule. All Terra calls received the approved mechanism/history instructions.

## Cache and capsules

Both follow-ups8minutes apart reuse saved context. Dialog1 reads9598/11392 tokens (84.25%); dialog2 reads10701/11851 (90.30%). Growth1103 equals first-dialog cache write. No refresh.

Short user source325tokens retained verbatim by policy. Assistant memory611→493tokens (19.3% reduction). Day capsule1072tokens, one Luna pass28credits, below1200 retry threshold. Brief105tokens, slightly above intended50–100 range. Luna input contains current snapshot and user-facing analysis, without previousAnalyses.

Capsule preserves the chosen example versus pending demonstration, actual boundary message and acknowledgment, Marta's unresolved choice, one35-minute walk, photo retained despite deletion urge, and Nemory's photo advice as untested advice. No significant impulse/action conversion identified in this day capsule review. Weekly recompression from Sep20 was not retested.

## Covered usage

| Operation | Input total | Cached read | Cache write subset | Output incl reasoning | Credits |
|---|---:|---:|---:|---:|---:|
| Entry |10590|0|9598|812|358 returned|
| Dialog1 |11392|9598|1103|353|104 calculated|
| Dialog2 |11851|10701|1046|262|82 calculated|
| Day Terra |10728|0|10725|978|387 derived|
| Day Luna |6294|0|0|1194|28 returned|
| Total |50855|20299|22472|3599|959 covered/calculated|

Day frontend aggregate415credits,17022input,2172output. Dialogue charges use configured rates and actual provider token classes; no independent wallet reconciliation. Standard input8084, cached read20299, cache writes22472 (included in total input). Input not served from cache30556. Embeddings/helper costs absent from these five provider events are excluded. No new paid AI calls for audit; coding-agent quota/token usage unavailable.

## Next

Keep current prompt while collecting evidence. Track alternative explanations, cause-versus-outcome precision, and advice that accidentally creates fresh obligations. Review final planner reselection consistency separately before changing it. Existing weekly recompression problem remains open.
