# Lite Sep19 audit — plain mechanisms and required history

Read-only audit on 2026-10-03 of user-run `daily-scenario-2026-09-19-v1`.
Trace: `55cb0f70-260d-4cd1-84b9-69adad7d0963`.
Evidence: frontend/backend `.tmp/context-audit-2026-10-03.jsonl`, provider-prepared messages, provider usage and frontend result. No paid replay, runtime or prompt changes.

## Scope and quality

The seed completed with two entries and two check-ins. Entry analysis was intentionally disabled for this sparse-cycle day. Only the manually requested daily analysis (gpt-5.6-terra) and its capsule (gpt-5.6-luna) ran. This does not test entry/dialog behavior or growing dialog cache.

Both new shared instructions reached Terra: simple explanation of reactions followed by practical steps, and required examination of supplied history.

The daily response is clearer than Sep18: it explains the unfinished-task/checking impulse through immediate relief and a possible longer-term monitoring pattern; explains the wish to extend a walk for a more impressive number; and gives concrete next steps. It distinguishes restrained impulses from their disappearance and does not announce completion of the 5 km goal. Historical comparison is explicit, including the supported Sep16 choice not to add five minutes merely for a completion mark. There is still some abstract wording, but less than in Sep18. This is an observational comparison across different inputs, not a controlled A/B evaluation.

Remaining precision issue: the phrase that the same controlling dynamic had already strained the relationship on Sep17–18 overstates the evidence. Sep17 documents a harsh tone and uncertainty about household responsibility. Sep18 documents a restrained checking urge; its capsule explicitly attributes the possible monitoring role to Nemory as an unconfirmed interpretation. The connection is relevant, but a repeated hypothesis should not become an established past cause.

Smaller qualifications: calling the walk definitively appropriately dosed goes beyond the reported mild fatigue and unknown next-day outcome; not cleaning the entire cupboard does not establish the psychological function of cleaning the extra shelf. No further prompt edit is made on this single result.

## Actual context and compression

- Current day: 2 entries, 2 check-ins and planner data; current-period budget measurement 2,611 tokens.
- Previous daily capsules: Sep18, Sep17, Sep16, Sep15, Sep14. No previous weekly/monthly capsule.
- Selected context: 7,939 / 7,500 tokens; overage 439. This follows the approved whole-final-capsule soft limit rather than truncating the capsule.
- Terra provider input: 10,526 tokens including prompt/envelope; output 786; finish reason stop.
- Luna received current-day snapshot and the user-facing analysis. Its structured input has no `previousAnalyses`; previous daily capsules were not passed into compression.
- Saved capsule: 1,060 tokens; one pass, 26 credits. Nominal target 900, retry threshold 1,200; retaining the first pass is correct under the accepted policy.
- Capsule preserves action status, restrained urges, uncertain next-day outcome, measurements and attribution of Nemory hypotheses. Fixed source observations account for 326 tokens.
- Short day memory: 83 tokens. It retains Nemory attribution but uses an imprecise statement that the result remains unknown: the household list was completed; only later effects/next-day physical response remain unknown.

## Usage ledger

| Call | Input total | Cached read | Cache write (subset of input) | Output incl. reasoning | Credits |
|---|---:|---:|---:|---:|---:|
| Daily Terra | 10,526 | 0 | 10,523 | 786 | 359 |
| Capsule Luna | 5,188 | 0 | 0 | 1,209 | 26 |
| Total | 15,714 | 0 | 10,523 | 1,995 | 385 |

359 credits for Terra is derived from returned aggregate 385 minus capsule 26. Input without either cache read/write is 5,191; input not served from cache is 15,714. Cache writes are not added again to total input. Luna output includes 359 reasoning tokens; Terra reports zero reasoning. Provider durations were about 9.6 seconds and 11.0 seconds respectively, not complete UI elapsed time. The ledger covers these two calls, not a complete account-wallet reconciliation or embedding costs. This audit itself launched no paid AI calls; agent token/quota usage was not available here.

## Next check

Keep the approved prompt unchanged for now. On the next user-run day with entry analysis, assess the same readability, concrete steps and source-grounded historical links in entry/dialog responses. Watch whether Nemory-attributed hypotheses remain hypotheses across capsule reuse.
