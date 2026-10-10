# Session refresh reliability

Updated 2026-10-10. Applies to `diary-back/src/auth/sessions.service.ts` and the
frontend `utils/api/refreshManager.ts`, `utils/auth/sessionTokens.ts` consumers.

## Confirmed failure paths

- Refresh used to rotate on the server before the client knew the replacement.
  A lost response or process termination left only the old token. The existing
  60-second grace history could not repair a restart after that period.
- Reactive HTTP refresh and proactive socket/stream refresh had separate
  implementations. A failed anonymous recovery could leave HTTP waiters unresolved.
- Access was persisted before refresh, and `issueTokens` did not share refresh's
  transactional row lock. Interrupted writes and concurrent login/refresh could
  therefore invalidate credentials stored on the device.
- A successfully restored account could fall through to anonymous creation if a
  later subscription/profile/unread request failed during first-launch restoration.

These paths were identified in code and reproduced with automated tests. They do
not establish which path caused an individual production user's reported logout.

## One refresh flow

HTTP 401 handling and `getValidAccessToken` now share one in-flight promise with
bounded network requests. All callers receive success or rejection, including
failed guest recovery. A delayed 401 uses a newer access token if the same local
session is still active. Requests from before login/logout are not replayed under
another account. Credential endpoints do not refresh the previous session.

Session writes, login and logout use one client-side write lock. A generation and
persisted owner/device/refresh snapshot reject stale refresh results. Store refresh
before access; await storing the authenticated user before dispatching Redux.
Device key creation is single-flight and repairs a missing public half from the
existing private key instead of silently replacing the signing identity.

Transient transport/server errors retain credentials and identity. A true guest
can recover only its existing user through the existing signed `recover-anon`
endpoint. Registered sessions require login after both refresh credentials are
explicitly rejected or the server reports the session no longer exists. No guest
is created as a substitute for failed refresh. Explicit logout still clears tokens.

## Durable rotation protocol

The existing `POST /sessions/refresh` accepts optional `nextRefreshToken`, a
64-character lowercase hex value generated from 32 cryptographically random bytes
on the device. Before sending, the client records its owner, device, original token
and candidate in SecureStore (`pending_refresh_rotation_v1`). This is a recovery
journal, not another user identity or server-side session store.

The signed JSON field order is `userId`, `deviceId`, `refreshToken`, `ts`, followed
by `nextRefreshToken` when present. The server validates the device signature and
current/history refresh credential before adopting the candidate as the next
refresh token. It retains the existing bcrypt hashing, history expiry, timestamp
window, user/device scope and response shape. No database migration is required.

After a lost response, the client retries the persisted original/candidate pair.
If the original has expired, it presents the candidate and proposes that same
candidate. This succeeds only if the server actually adopted it. Thus a completed
rotation survives process death even beyond the history grace period, without
accepting an expired historical token or allowing signature-only authentication.
The journal is cleared only after successful token persistence or explicit session
replacement/logout. It must never be logged or copied into diagnostic exports.

`issueTokens` and refresh now lock the same session row during changes so a stale
refresh cannot overwrite credentials issued by login/recovery.

## Compatibility and rollout

Deploy the backend first, then release the app. Previous released clients omit
the optional field and retain the previous server-generated protocol. New clients
fall back to a signed legacy payload for older servers and sessions without a
registered public key. That fallback cannot provide lost-response durability;
full protection requires the new server and a device-bound session.

Already-lost registered credentials cannot safely be recreated by this change:
one legitimate login may still be necessary. Local identity/settings are not
deleted by refresh failure. Uninstall/OS deletion of SecureStore is outside this
mechanism; anonymous recovery still requires the saved guest identity and key.

## Verification

Backend session/auth tests cover existing grace behavior, row locking, expired and
invalid tokens, lost-response recovery, tampered/stale/wrong-key signatures and
legacy clients. Frontend tests cover process restart with durable storage,
concurrent callers, transport/5xx failures, guest recovery failure and retry,
proactive recovery, logout/account-switch races, partial writes, malformed
responses, legacy fallback, key creation and successful restore followed by a
secondary request failure. TypeScript and scoped lint are also checked.

Production rollout and destructive phone/account tests were not performed.
