# BUG-N6-03 — first-launch anonymous creation and device trial eligibility

27 October 2026. Implemented locally; deployment/rebuild/manual acceptance pending.
This concerns anonymous creation at first launch, NOT later email registration.
The overnight regression remains stopped.

## Implementation

`UsersService.createUserByUUID` now owns one database transaction for the device
claim, user, salt, settings, AI defaults, initial topic read markers, optional
legacy trial and session/token persistence. Existing services accept the same
optional EntityManager; other consumers retain their normal execution path.
The legacy trial's subscription projection joins the same transaction and its
failure propagates, instead of leaving a partial bootstrap committed.

The existing device advisory lock (namespace728491) now lasts until the entire
bootstrap commits. Request UUID retries additionally serialize under728492.
An error before commit rolls back the new device claim and account records.
No registry deletion on logout/account deletion, schema change or trial-policy
change. Missing/blank unique device identity still does not grant trial eligibility.
Existing consumed device records are not reset retroactively.

Current V2 trial initialization remains in the existing separate subscription
flow. Its input eligibility stays on the successfully committed user; retries
do not manufacture new eligibility or reset an existing subscription's credits.
Legacy clients with planData still initialize their legacy plan within creation.

For a successful commit whose HTTP response is lost, the updated client retains
the unfinished creation UUID in SecureStore (`pending_anonymous_creation_v1`),
bound to the current deviceId/public key. It retries that UUID with a fresh
Ed25519 signature from the existing private key. Concurrent client calls share
one pending request. Success clears the pending metadata; later intentional guest
creation uses a new UUID. This is a small pending-operation record, not a second
account store. No new backend table or column is introduced.

The backend returns an existing guest only after checking its stored session's
key, deviceId and a signature over purpose/UUID/deviceId/timestamp. It rejects
registered/system/email/phone/password/OAuth accounts and missing sessions.
UUID or device identifiers alone do not authorize recovery. The120-second signed
timestamp freshness check follows the existing device-auth convention; it is
not a timeout for creation or database work. Older clients may omit the proof
for a fresh creation, but cannot recover an existing profile by UUID alone.

Limits: the retry metadata/key must remain on the phone. Reinstallation after a
successful server commit can erase them; this change does not grant another trial
or recover an account from a bare device identifier. A client crash after receiving
a successful response but before persisting its session is outside the lost-HTTP-
response guarantee. No existing device registry entries are bulk-cleared.

## Validation

207 unique tests PASS: backend187 across anonymous atomicity, users, auth,
sessions, plans, subscriptions and Google Play adapter; frontend20 across anonymous
creation and signing keys. New bootstrap tests use real service paths with a
stateful rollback/serialization model and fake repositories/native storage.
They are NOT an actual PostgreSQL concurrency or physical-device test. Legacy plan
transaction forwarding is separately tested against real PlansService; existing
subscription/trial rules retain their own tests. No real accounts, purchases,
provider calls or device registry mutations were performed.

Backend TypeScript noEmit passed. Scoped source lint passed on both repos; the
new PlansService import formatting error was corrected and rechecked. Diff checks
passed. Full frontend TypeScript was not run. Results under each repo's
`.tmp/overnight-20261027/bug03-*`; backend atomic cases rerun after final row-lock
addition. Prior passing unrelated suites were not broadly rerun.

## Deployment and tests

Deploy backend FIRST, then install the updated frontend build. No new environment
variables or migrations. Backend alone fixes precommit rollback for old clients;
lost-response UUID reuse requires the new client. Avoid testing the new retry
protocol against an old backend, which cannot resume the existing UUID.

**N6-03.1 is user PASS for the issued first-launch/reopen scenario**; N6-03.2–N6-03.6 have no manual acceptance. Use an isolated
QA backend/device identity. Do not clear production device records or create real
purchases to obtain test prerequisites.

28 October 2026: user confirmed "пройшов, наступний" directly after N6-03.1. Accepted scope: first launch, enter name, complete onboarding, reach Today, close/reopen, retain the profile without repeated name entry or errors. No separate confirmation of previous-client compatibility, trial accounting or injected failures is inferred. Device identity and exact installed build were not independently inspected for this acceptance. Do not require a repeat of the accepted scenario without a relevant change.

| ID | Check | Expected |
| --- | --- | --- |
| N6-03.1 | First launch on a new QA device/identity. Complete onboarding and reopen the app. Repeat the successful creation path with the previous supported client. | One usable anonymous profile, settings and session; normal trial eligibility; no duplicate trial after reopening. |
| N6-03.2 | Inject one QA database failure during initial user/settings/session creation. Retry, including after app restart. | First attempt fails with no committed user/device claim; retry succeeds with first-device eligibility. |
| N6-03.3 | On the updated client drop the creation HTTP response after a successful backend commit, then retry/restart. | The same user is returned with usable credentials, no second profile, plan or trial grant. |
| N6-03.4 | Create another anonymous profile on a QA device which has already successfully claimed its trial. Also test missing device identity. | No new trial eligibility. Existing registry history remains intact. |
| N6-03.5 | Engineer test on PostgreSQL: concurrent requests with the same UUID, then different UUIDs for the same new device; repeat in legacy planData and current V2 flows. | Same UUID resolves to one account with valid proof; different UUIDs consume the device's first-install right only once. All related rows roll back on injected failures. |
| N6-03.6 | Engineer test: retry an existing UUID without proof, with another key/stale signature/deviceId, and after the account becomes registered. Also repeat V2 initial-subscription requests. | Unauthorized recovery rejected; legitimate current-user subscription retries do not replenish or duplicate trial credits. |

N6-03.2/3/5/6 need controlled test infrastructure. They are not instructions to
damage a phone database or alter a real user's trial records.
