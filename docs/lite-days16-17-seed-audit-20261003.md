# Lite / Terra: 16–17 вересня після правки історичних зв’язків

Read-only audit of actual frontend/backend context-audit-2026-10-03.jsonl events 07:14:18Z–07:17:40Z. No runtime/prompt changes, seed reruns, data mutations or paid calls. This document records synthetic test-scenario findings; no full raw provider logs are copied here.

## Execution and actual prompt

Both seeds completed: Sep16 9/9 steps (two entries, two check-ins, one main analysis and one dialogue); Sep17 8/8 (one entry, three check-ins, one main analysis, no dialogue). A user-facing daily analysis was generated only for Sep17. Sep16 was deliberately missing, and its capsule-only recovery succeeded during Sep17 preparation.

All four actual Terra provider requests include the accepted `Name relevant past episodes by date or situation` paragraph and the prior mechanism-focused common instruction. This is not an old-prompt/backend-refresh issue. Main model gpt-5.6-terra; capsule generation gpt-5.6-luna; plan lite-m1.

Traces: Sep16 entry da7b82f2-1d46-421c-a2dc-11237dc3419a; dialogue dialog-bad4a5b1-de6c-485a-b821-ef45625cb3d8; Sep17 entry 8774c4ae-38e1-4c6c-bb55-e785b26d1d7e; Sep17 day 01bc9aca-77af-4b24-8b08-68f127085c2d; Sep16 recovery de08ac4d-b73a-4e19-b02b-a6e04cc88888.

## Actual context

| Request | Retrieved context | Sources | Whole provider input |
| --- | --- | --- | --- |
| Sep16 entry | 6366 / 6000 tokens | 9 records | 10903 |
| Sep17 entry | 6099 / 6000 tokens | 11 records | 10490 |
| Sep17 day | 8100 / 7500 tokens | Current day plus daily capsules Sep12–16 | 10637 |

Overages follow the approved whole-last-unit soft-stop rule; they are not hard-limit failures. Full input includes system/task/payload beyond the retrieval allowance.

Sep16 selection: five fresh check-ins (Sep14 morning/evening, Sep15 morning/evening, Sep16 morning), relevant entries Sep15 notifications (score .7456, two dialogs), Sep7 chat checking (.7360, two dialogs), Sep8 evening check-in (.7106), Sep9 client questions (.6890, two dialogs). Daily brief memories Sep14/15/7/8. No active commitments or long-term user memory selected.

Sep17 selection: five fresh check-ins (Sep15 morning/evening, Sep16 morning/evening, Sep17 morning), relevant Sep11 fatigue/Marta (.7083) and Sep15 evening walk (.6146), then recent Sep16 evening entry, Sep16 main entry with one dialog, Sep15 main entry with two dialogs, Sep14 evening check-in. Brief memories Sep15/11/14. No active commitments or long-term user memory selected. Sep16 brief did not exist when the entry ran; it was created later during daily recovery, so its absence here is expected.

The relevant Sep7 and Sep11 source titles are present in the corresponding actual provider messages, not just in retrieval diagnostics. Sep11 brief also reaches the Sep17 entry provider payload. Delivery is working for these examples.

Sep17 daily current-period context 2760 tokens; capsules added newest-first: Sep16 ->15 ->14 ->13 ->12, reaching8100. No weekly capsule. Sep11 is outside this daily selection, so its missed comparison can be attributed to the entry answer, not demanded from the day answer.

## Response quality

**Historical-link change has not achieved the intended behavior in these two entries.** Neither explicitly identifies a previous episode and compares it with the present. Sep16 could connect the actual availability experiment to the previous day's plan, or compare the specific correction with Sep7. Sep17 could compare fatigue and unsupported interpretation of Marta's behavior on Sep11 with today's unagreed household duties; similar circumstances need not imply the same cause. The daily summary does compare yesterday's better sleep/stress with today, but this is a narrow state comparison rather than longitudinal analysis of the interpersonal mechanism. No same-input Qwen/Terra A/B was run.

Mechanism explanation itself is useful, especially Sep17: low sleep reserve plus possible unfairness interpretation; defensive urge to list one's work; short-term relief from shame versus escalating a contest of exhaustion; separate repair of hurt from negotiating household responsibilities. It offers concrete wording and does not demand immediate forgiveness. The Sep16 dialogue separates bounded feedback from a global negative judgment and gives an actionable evidence check.

Source fidelity concerns:

1. Sep16 entry claims no urgent situation was missed based on no phone calls. The source establishes only that nobody called, not that all urgency was successfully handled. The successful availability experiment is plausible but should not be treated as a guarantee.
2. Sep17 summary promotes a plausible sleep-related explanation to certainty: reduced inhibitory reserve and the cup as a trigger for accumulated issues. Source evidence supports exploration, not a proven cause. Entry wording is more careful than summary wording.
3. Sep17 summary says the walk was recovery rather than avoidance and that it supported endurance without avoidance. Recorded conversation completion and walking support the actions/order but do not establish subjective recovery or motive. Avoid treating intention plus completed actions as proof of their psychological function.

Checked a potential false positive: “talked and listened” is supported by the completed planner checklist item `Спокійно поговорити й вислухати`; it is not inferred solely from the evening check-in. Yesterday's stress2/5 is also supported at all four recorded Sep16 moments, though moments are not continuous monitoring.

Seed limitation persists: both main entries already contain considerable self-analysis and feasible plans. These cases test fidelity and continuity more strongly than independent discovery of a mechanism. No unrequested seed or prompt changes applied.

## Recovery, capsules and cache

- Sep16 capsule-only: 1000 tokens, one pass,23credits. The visible daily analysis is absent; Luna receives `userFacingAnalysis` empty and the actual day's sources, including entry response/dialogue. No invented daily response was generated. Brief85tokens.
- Sep17 capsule:1027tokens, one pass,24credits. Lite writing goal900 and retry threshold1200: both correctly accepted without a second pass. Brief88tokens. Both recovery/compression inputs contain only their own day, no previous daily capsules.
- Sep17 capsule keeps the explanation attributed as Nemory's hypothesis, preserves residual tension, tomorrow's household discussion and the unfinished screen-free pause as unknown. The brief does not claim the disagreement is fully resolved. The capsule calls the walk an “окремий етап” of the active goal; that wording should not be read as a new completed goal stage without planner evidence.
- Main source text346/330tokens is deliberately retained verbatim (`short_original`, candidateTokens0). Assistant response digest475->348 (~26.7%) and610->456 (~25.2%). This is different from attempting a prose rewrite and selecting a near-identical result.
- Only one dialogue in this pair of seeds. It reused the stored snapshot after8simulated minutes. Actual cache9885/11559=85.5%; cache write995tokens. Entry-to-first-dialog comparison has4identical leading messages,6->8messages and expected JSON-to-text response_format change. This is not a test of second-dialog cache continuity.

## Cost scope

Actual API returned340credits for Sep16 entry,360for Sep17 entry,374for Sep17 daily main+capsule (350+24), and23for Sep16 recovery. Dialogue110credits is calculated from actual provider usage and current tokensToCredits rates (59input+51output). These six operations total1207credits: Sep16entry/dialog450 and Sep17entry/day/recovery757.

This is NOT a complete wallet reconciliation: separate user/assistant memory extraction, action extraction and embedding costs are not reconciled from the database. Six logged provider operations: standard fresh input12811, cache-read9885, cache-write31013, output4674including reasoning. No paid API calls were made by this audit; audit-generated fresh/cached/output usage0.

Next: retain these two concrete missed historical comparisons. Prefer a controlled same-input comparison or one isolated replacement in the mode-specific task if further authorized; do not grow the common prompt, expand retrieval or claim this wording fixed continuity. Existing evidence shows history arrives but is underused.
