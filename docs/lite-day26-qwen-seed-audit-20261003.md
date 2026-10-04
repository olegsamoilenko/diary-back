# Lite September 26 — Qwen audit, 2026-10-03

Read-only audit of frontend/backend context logs, final provider payloads/responses and token_usage_history READ ONLY query. No runtime/prompt changes, paid reruns, source-data repairs or restarts. Frontend received completed daily report; no fresh phone acceptance claimed.

## Scope and approved accuracy wording

- Entry trace `a52c6e1f-c8f6-4124-a5c8-bbf6b3ae425b`, source `a196111b-2e2b-4e5f-8bdd-d7a8364b42ee`.
- Dialogs `dialog-67efc401-9c18-4cec-8eda-b9e0f385540c`, `dialog-e2bc7a06-77fb-4edf-b5bd-52769ed3a52f`.
- Daily trace `bce7572f-066d-4ae3-a82a-a6ad444d7334`.
- All four Qwen 3.8 Max final prompts include the approved minimal accuracy sentence. All finish with stop, not length. Luna handles memory/capsules separately.

## Quality

Entry explains why enjoyment of painting loses salience during comparison and provides feasible next steps: another available workshop without committing to a full course or buying materials, and sharing the drawing as an experience. Historical bowling connection is supported by the actual Sep24 entry/capsule. Dialog1 responds to the user's clarification that mixing colors mattered more than a straight cup; dialog2 addresses sharing with friends and compulsive reaction checking.

Daily incorporates both sources and the latest evening check-in: already drew with a pencil, did not order paints, walking was20/30 and shortened for rain rather than pain, next-day river route prepared. It does not repeat the previous day's missing-decision error. This is one observed good outcome, not proof the wording change caused it.

Accuracy shortcomings remain:

- Explanations still categorically identify the course/purchase impulse as securing status/obligation and not buying as protection rather than indecision. These are plausible hypotheses, not confirmed motives. Day uses a qualifier once but surrounds it with categorical exclusions.
- Dialog2 asserts the first10–15 minutes of waiting are the most intense and that it becomes easier afterwards. This is unsupported precision/prediction, not a user-specific observation. A10-minute phone break could be an experiment, but should not be presented as a known trajectory.
- Daily infers body readiness for exertion from normal legs after a20-minute walk. Sources support absence of current leg pain, not assurance of readiness for a5km load.
- Daily credits the pleasant sharing experience to the suggested framing, although the user reports showing the drawing and the partner's reaction, not explicitly applying that framing.
- Opening claims one mechanism in three situations and conclusion includes walking despite rain in the comparison/avoidance pattern. That last causal link is not supplied.
- Minor prose defects: entry invents a precise1.5-minute mood shift; source says roughly a minute before wanting to show the sheet. Day says went out "because of rain" where source says shortened the walk because of rain; awkward phrase "можлива інтуїтивна захищення".

Verdict: substantive and useful analysis, preserved preferred explanatory style; minimal accuracy instruction is delivered but does not reliably calibrate all claims. Do not automatically broaden prompts from this audit.

## Final entry context (not only initial retrieval)

Initial retrieval reports11 candidates and5961/6000 tokens. Final planner-linked context rebuild contains10 source IDs, all10 confirmed in the actual provider messages:

- Mandatory fresh check-ins: Sep24 morning/evening, Sep25 morning/evening, Sep26 morning.
- Semantic entries: Sep25 evening (.63806), Sep12 (.60901).
- Recent entries: Sep25 work (.54710, two dialogs), Sep24 evening bowling (.52125), Sep24 afternoon planning (.58130, two dialogs).
- Initial11th candidate, Sep23 evening check-in, is absent already in context.initial.built. This is final assembly selection, not backend dropping an already-submitted source. linked-entry-response-context.service.ts enriches linkedPlan and runs the same200-token/whole-source selector again. Do not report initial5961 as a measured final context size.
- Only brief day24 is present. Standalone selected user long-term memories:0. The manual day25 summary has asOfOct3 and is unavailable to the historical Sep26 source. The day25 source-only capsule/brief recovery happens later for the daily summary, not before this entry.
- Full entry provider input11577, distinct from the6000 memory budget. Final memory records are chronological. Planning includes the linked workshop, goal and habits.

## Daily context and compression

Daily current-period context3702 plus4155 previous-period context =7857/7500, whole-final-capsule overage357. Exactly four earlier daily capsules25,24,23,22; no weekly capsule. Current day includes both entries, morning/evening check-ins, attributed reflection memory and both dialog memories, planner data. Latest check-in is delivered and used.

Missing eligible Sep25 capsule is recovered through Luna (trace94b4b33b-5921-4b6a-9431-ae62e1b16b00):1133tokens,26credits, one pass. The existing manually generated report is outside the seed's asOf boundary; see qwen-daily-latency-20261003.md.

Entry original342tokens retained verbatim under short_original; separate user-memory extraction10credits. Assistant digest636→457tokens (28.1% reduction).

Daily Luna sees current day and visible analysis, no previousAnalyses. First capsule1214 exceeds Lite retry threshold1200 by14. One retry yields1087; selectedPass2, ready. Fixed source observations319tokens; prose reduction14.2%, total reduction10.5%, despite requested46%. First pass31credits, repeat19, total50. Accepted result remains above900 guide under the approved one-retry policy. Brief104tokens, slightly above50–100 guide.

Important memory error: user dialog "показати малюнок друзям, як фотографію у вівторок" compares with a past photo-sharing episode. First day capsule turns this into "для запланованого показу малюнка друзям у вівторок"; second keeps "для показу малюнка друзям у вівторок". Source dialog memory still preserves the comparison, so the false schedule originates in daily compression. No source repair or hidden rewrite performed.

Daily brief preserves comparison explanation, practical steps and reported sharing outcome. The capsule retains partial walking completion, intent vs attendance, and describes AI explanations as hypotheses. Main unresolved risks are the invented Tuesday scheduling and weak recompression efficiency.

## Usage and cache

DB rows4453–4468, same verified test owner and bounded15:40–15:46:10Z window. Four one-credit embedding rows have null traces and match the seed window; other rows correlated by exact traces. Output includes reasoning; input includes cached/write tokens.

| Operation group | Credits |
| --- | ---: |
| Entry Qwen + user/assistant memory | 360 |
| Dialog1 + memory | 139 |
| Dialog2 + memory | 105 |
| Four embedding rows | 4 |
| Recovery of eligible day25 capsule | 26 |
| Day26 Qwen | 340 |
| Day26 capsule first + retry | 50 |
| Background actions extraction | 7 |
| Total covered window | 1031 |

Full input81822; cache read27195; cache write2619; remaining uncached non-write input52008. Output11596. Do not sum cache counts on top of full input. No API-equivalent price estimate or coding-agent quota estimate.

Qwen dialog cache10240/12443=82.30%, then12288/13052=94.15%; stable-prefix reuse grows. No history compression triggered for these two ordinary follow-ups. Frontend daily aggregate390 covers340+50; background actions7 and prior recovery26 are separate. Last Qwen first content30.4s, completion63.7s; timing details in the linked latency report.

Next: continue quality tests with the accepted minimal prompt unless user chooses otherwise; separately discuss daily-capsule date fidelity and weak repeat compression. No automatic prompt expansion.
