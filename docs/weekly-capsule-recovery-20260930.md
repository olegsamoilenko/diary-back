# Weekly capsule recovery — 30 September 2026

## Follow-up: blocked request after Metro failure

Confirmed runtime error: Metro EMFILE in its transform-cache read; the Metro process held over34,000 handles. Separately, recovery persisted `submitted:true` before HTTP preparation, so a local/preparation failure left a false uncertain-request lock. Root cause of the Metro handle growth itself is not established; no speculative bundler tuning applied. User will restart Metro personally.

Frontend now persists the unsent request first and marks it submitted through the shared API wrapper's awaited `onBeforeDispatch` adapter hook, after interceptors and immediately before transport. A failed marker write or account switch prevents transport. An actually dispatched uncertain request remains blocked. Debug exposes an explicit confirmed new capsule-only attempt tied to the exact pending request ID; cancellation does nothing, and there is no automatic paid retry. This also offers recovery for the already-stuck legacy marker. The saved weekly answer and dialogues remain intact.

Validation:7 capsule-recovery tests,2 actual API-adapter ordering/failure tests,23 Debug UI tests passed; frontend TypeScript passed. Successful on-device generation after this fix remains pending the user's Metro restart. No new paid call made during this fix.

Problem: Sep7–13 weekly answer was saved, but Luna consumed its 2048-token provider ceiling entirely as reasoning and returned no text. The previous capsule policy ceiling was also reduced by the common response output helper.

Fix: day/week capsule accounting types select the period-capsule purpose in the shared executeResponse non-streaming path. Luna permits the policy output ceiling (text maximum +4096 reasoning/JSON headroom, bounded by8192). Base week maximum1350 means5446 total output ceiling. Main answer limits, model selection, reasoning effort and main prompts are unchanged. Billing still uses actual provider usage, including reasoning; the ceiling is not the charge.

Weekly Luna input now contains only the validated dated daily capsules of the current week. The saved weekly answer and previous-week comparisons are excluded from capsule generation. Existing conditional compression retry and diagnostic files remain.

`POST /ai/periodic-analyses/capsule/week` uses existing auth, PlanGuard, expected owner validation, request-ID claim and shared paid lifecycle. It creates only the auxiliary capsule. No weekly answer or journal data is persisted on the server. The frontend preserves the current report and dialogues, adds actual usage, and saves the capsule on the device. Unknown request outcomes prevent a blind paid retry. Debug day13 has a dedicated recovery button; no full seed rerun is needed.

Validation: 50 periodic/provider tests and13 provider/daily-capsule tests passed in focused runs;15 frontend service/recovery tests passed, including unknown outcomes, account changes, existing capsule and daily coverage. Backend scoped ESLint passed. Backend full typecheck still has the existing unrelated TS2589 in image-generation.service.ts:109; frontend typecheck passed.

Initial phone recovery was blocked by Metro EMFILE. Later, after the user-managed restart, recovery succeeded: frontend weekly_capsule_recovered confirmed local saving at15:59:11Z on30 September. First capsule3087 tokens, retry2374 tokens against1350 target; fallback retained the complete first capsule, status over_budget. Actual auxiliary usage105 credits, input14074/output6194 tokens across both requests. The phone showed the3087-token saved result. User subsequently ran September14; its audit is deferred until the report UI/year work completes.

Monthly decision, pending implementation: include completed weekly capsules intersecting the calendar month and uncovered daily capsules at its tail. Attribute facts by their dates; preceding-month material is background, not current-month counts. September2026 has four such completed weeks through27th and a28–30 daily tail. Current code must not be assumed to implement this decision yet.

Usage: successful recovery105 provider credits as above. Exact Codex fresh/cached/output token totals are unavailable; no API-equivalent estimate or quota delta is substituted.
