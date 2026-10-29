# NA-42 — server-owned trial during anonymous bootstrap

## Contract

- A new account is trial-eligible only when its nonempty uniqueId is absent from the database. Known or missing uniqueId does not grant another trial. The device claim remains atomic with account creation; a failed transaction does not consume eligibility.
- Current clients omit planData and continue through ensureInitialState, which uses persisted server eligibility. Existing paid state remains unchanged.
- Legacy clients may still send planData, but its contents must not reach subscribePlan. The server constructs START, ACTIVE, zero price, no auto-renewal or store identifiers, and a server-clock expiry using the START duration in the subscription catalog (currently 7 days). The existing PlansService supplies the catalog credit limit (currently 5000) and projects legacy state into V2 within the same transaction.
- Verified Google Play purchase/restore and Pub/Sub processing stay on their existing paths. Bootstrap cannot be used to ingest a purchase token.
- This change does not add physical-device attestation or resolve the separate NA-37 legacy subscribe finding.

## Automated checks

29.10.2026: **131 tests PASS in 4 suites**, TypeScript and scoped ESLint PASS, diff whitespace check PASS. Before the fix, the two new forged-payload tests failed against the vulnerable implementation. Checks use synthetic repositories / mocked Google responses; no production data or real purchase was changed.

- anonymous-creation-atomic.spec.ts: forged paid plan and forged START fields, current-client eligibility, known/missing device identity, idempotent retry, existing paid plan preservation, transaction rollback and concurrency.
- plans.service.spec.ts: actual trial creation/projection, paid creation, renewals, token ownership and transaction propagation.
- subscriptions.service.spec.ts: V2 first-install trial, returning-device denial, existing paid state, Google Play subscription updates.
- iap.service.spec.ts: Google-verified creation and Pub/Sub, verification failure and ownership conflicts.

## Necessary manual checks after backend deployment

Pending; automated checks are not phone/Google Play acceptance. No new mobile build is required for this backend change.

1. **NA42.1 — first launch:** on a genuinely new test device identity, complete normal first launch. Expect START with 5000 credits and 7 days. Do not clear the device registry or delete a real account just for this check.
2. **NA42.2 — existing paid account:** open the existing app with an active paid plan and refresh its subscription. The plan, expiry and spent credits must remain unchanged. Reuse a planned purchase/restore check if one is already pending; an extra purchase solely for this narrow fix is unnecessary.

Known-device and malicious-input scenarios are covered automatically; no expanded manual matrix is required.
