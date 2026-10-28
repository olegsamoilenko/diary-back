# BUG-N6-12 — profile update protection, 27 October 2026

Status: implemented locally; SEC12.1 existing-profile name edit accepted by user on DEV, 28 October 2026. Production deployment is not confirmed. This is a
separately authorized morning fix, not a resumption of the stopped regression.

## Boundary and consumers

`PATCH /users/update` retains app JWT authentication and the existing own-account
hash verification. A concrete `UpdateUserDto` activates the existing global
ValidationPipe whitelist. The controller additionally projects only the supported
fields; it never forwards an arbitrary user entity to the trusted service.

Allowed body fields:

| Field | Purpose |
| --- | --- |
| `hash` | Required existing account verification, not a stored update |
| `name` | Onboarding name and Settings → profile name |
| `lastActiveAt` | Background activity update and existing statistics flow |
| `usesWithoutSubscription` | Older-client choice; existing legacy/V2 sync retained |
| `appVersion`, `appBuild` | Existing version metadata in user settings |

Released clients send `appBuild` as an environment-variable string; digit strings
remain accepted and become integers. Boolean choices must be actual JSON booleans,
not truthy strings. Optional fields may be omitted; invalid supplied values return
400 before any writes. Length/range bounds follow the database column capacities.

Unsupported fields are stripped, not written: e.g. role, identity/email/password,
verification flags/codes, system status, encryption data, subscription runtime,
relations and lifecycle dates. A mixed request may still update its allowed fields.
A privileged-only payload is a verified no-op; metadata-only updates do not issue
an empty TypeORM entity UPDATE. Existing response shape `{ user }` is preserved.

Live front consumers: `ChangeNameModal`, `AuthGate`, `useUpdateLastActive`, through
`store/thunks/auth/updateUser.ts` and `utils/api/endpoints/auth/updateUserApi.ts`.
Repository history inspected: builds 269 (`d1425f2a`), 275 (`da68c365`) and current
276 source. This verifies the checked-in request contracts, not installed binaries.
Legacy without-subscription compatibility is also retained by existing API and
service regression contracts. Current continue-without-AI uses its own endpoint.

Landing has no direct caller of this profile PATCH in the inspected source. Its
`lib/api/users.ts` calls the separate admin-jwt guarded `POST /users/change-user-role`.
AuthService calls the shared service directly for verified email changes, password
resets, password login and existing Google login. Their trusted fields remain
supported. Registration uses its separate updateRegistrationGuest flow. No filter
was applied to the shared trusted service and no auth/billing policy was changed.

Files: `src/users/dto/update-user.dto.ts`, `src/users/users.controller.ts`,
`src/users/users.service.ts`, `src/users/profile-update-access.spec.ts`.

## Local automated verification

155 unique cases passed: profile HTTP73, prior deletion HTTP23, UsersService54,
AuthService5. The new suite exercises real HTTP/JWT/ValidationPipe/service behavior
with synthetic repositories, including 36 unsupported fields, released request
shapes, invalid allowed values, hash checks, real-error propagation and protected
admin role changes. No real accounts or deployed API were changed.

TypeScript noEmit and git diff --check passed. New files pass ESLint; changed
controller/service pass semantic lint with formatting disabled. Full controller
formatting lint reports only the pre-existing updateUserSettings signature (also
present before this fix); it was not rewritten as part of BUG12.

Evidence: `.tmp/overnight-20261027/bug12-fix-results.json` contains the successful
54+5 service/auth cases alongside initial runner failures; `bug12-http-results.json`
contains 23 deletion and the initial 70 profile passes; final
`bug12-profile-final-results.json` has all 73 profile cases. Repeated cases are not
double-counted. Initial HTTP attempts failed because sandbox blocked localhost;
the permitted isolated run passed. An unsupported Jest matcher was corrected
before the successful runs. No failing application assertion remains in these suites.

## Manual tests after backend deployment

No new environment variables, migration or mobile/landing rebuild is required.
Use disposable QA identities. SEC12.1 existing-profile name edit is **PASS DEV**; other cases are not user accepted.

28 October 2026: user explicitly confirmed "SEC12.1: пройшов" after the narrowed manual scenario: change and save the profile name in Settings, close and reopen the profile, verify the saved name and absence of errors. Fresh-guest onboarding was explicitly excluded from this manual test; no new account is required for this acceptance. Do not infer production deployment or acceptance of every original extended scenario. Follow the user's essential-tests-only scope; do not repeat this accepted flow without a relevant change.
Use current and previous supported mobile builds for ordinary profile/auth flows.

| ID | Steps | Expected |
| --- | --- | --- |
| SEC12.1 | In Settings change the profile name, reopen the app/profile. Also set the initial name on a fresh QA guest. | Name saved and returned; no authorization or validation error. |
| SEC12.2 | Open/resume the app and inspect the QA user's activity/build metadata in admin. | Activity and version metadata update; no background error. |
| SEC12.3 | With a disposable account, send an authenticated profile PATCH with a valid own hash, allowed name, and extra role/emailVerified/id/uuid/settings/plans fields. Then repeat with only extra fields. | Extra fields do not change the account or another account. Mixed request changes only name; extra-only request performs no entity change. Verify persisted data, not just HTTP 200. |
| SEC12.4 | Repeat without JWT, with wrong hash, and with invalid name/date/boolean/build values. | Requests fail; no partial profile, statistics, subscription or settings writes. |
| SEC12.5 | On QA accounts, test password login, Google login, verified email change and password reset. | Existing protected authentication flows still work; profile whitelist does not block their internal writes. |
| SEC12.6 | In admin, change a QA user's community role and restore it. Attempt the same admin route with ordinary app credentials separately. | Authorized admin change works; app JWT cannot use the admin route. |
| SEC12.7 | Exercise the legacy supported client's "without subscription" choice if that client still exposes it; separately test the current "without AI" action. | Existing choice and legacy/V2 behavior retained; no subscription entitlement granted by profile fields. |

No production mutation is implied by this checklist. Run API/security tests in an
isolated test environment first. BUG-N6-14 (`update-settings`) and other findings
are separate issues; this fix does not claim to close them.
