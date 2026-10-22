# Registration ownership — 21 October 2026

The registration bug was an account rewrite: after logout, the client retained the old user UUID, and email registration (or a new Google identity) could attach credentials to that registered server user. Credits and subscriptions stayed with the same ID. This was distinct from the frontend's shared local journal database.

## Contract

- `/auth/registration` keeps its route/body/response, but guest conversion requires a signed, unexpired guest access token in `Authorization`. Its ID and UUID must match the target database row. A UUID alone is not ownership proof.
- A registered, email-verified or OAuth-bound user cannot be converted by registration. Another user's unverified email cannot be overwritten either.
- `UsersService.updateRegistrationGuest` rechecks guest flags, OAuth fields, ID, UUID and the previously read email in the UPDATE itself. This also protects email confirmation from a concurrent Google conversion or credential change.
- `/auth/sign-in-with-google` remains a single endpoint. Google token verification and the existing account branches decide login versus registration. Existing Google login continues to use Google identity proof; conversion of a guest additionally requires proof of ownership of that guest.
- Ordinary guest-to-registered conversion keeps the guest's server ID. No wallet, plan or purchase ownership transfer is performed.

## Client behavior

- A genuine authenticated guest supplies its current access token for conversion.
- After registered logout, a separate guest is prepared through the existing `createAnonymousUserApi`, including the existing phone unique ID and device keys. The previous account is not rewritten; the device-based starter-access check remains in effect.
- Preparation does not call `setUser`, commit active tokens, or open the application as a guest. Email verification owns the eventual session commit.
- Pending signup credentials are stored separately in SecureStore (`pending_registration_identity_v1`) so an interrupted signup can resume. Expired pending credentials use the shared signed refresh request. Successful authentication deletes this pending record.
- Google first attempts login. Only `REGISTRATION_SESSION_REQUIRED` causes the client to prepare a separate guest and retry the registration branch. Other errors are not retried as registration.
- Confirmation uses the pending registration email, not the previous account's email. The login notification moves from code-send to successful confirmation. Subscription UI state is cleared when the server user ID changes.
- Follow-up regression: preparing a separate registration guest bypassed `initAnonymousUser` and its subscription initialization. Live logs showed `SUBSCRIPTION_STATE_NOT_INITIALIZED` on `POST /subscriptions/continue-without-ai` after successful authentication. Email confirmation, password login and Google login now await the existing subscription bootstrap before publishing the authenticated Redux user and returning success. This initializes a missing returning-user state through the established legacy/V2 mapping, preserves existing entitlements, and does not grant a new trial. The root auth screen also reloads stored credentials after email confirmation, as it already does after password/Google login.

## Rollout and acceptance

No production deployment or real-account mutation was performed for this change. No database migration is required.

**Compatibility limitation:** previous clients do not attach guest ownership proof. New registrations from those clients will be rejected by the hardened backend and require an app update; existing email/password and Google login retain their routes. Re-enabling a UUID-only fallback would reintroduce the ownership vulnerability. Coordinate frontend/backend rollout.

Focused automated checks cover valid/invalid guest proof, existing registered/OAuth profiles, another unverified email, conditional writes, existing Google login, guest conversion, device starter-access behavior, pending email/session handling and temporary identity reuse. Native email delivery/confirmation and Google sign-in still require device acceptance.

Acceptance: (1) initial guest registers with the same ID; (2) registered A logs out and registers B, B receives a different ID while A's email, wallet and subscription remain unchanged; (3) returning to A works; (4) existing Google login reuses its ID, new Google registration after A's logout does not rewrite A; (5) cancelling/restarting before email confirmation does not unlock guest access.

**Local data isolation remains unresolved.** A different server ID does not yet switch the singleton local journal database. Do not mark G4.3 passed on the basis of this registration fix.
