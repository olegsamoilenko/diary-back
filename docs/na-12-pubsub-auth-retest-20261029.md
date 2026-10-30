# NA-12 — authenticated Google Pub/Sub push

## Confirmed configuration

User screenshot, 29.10.2026: project `nemoryai-publisher`, active subscription `nemory-rtdn-push`, topic `nemory-rtdn`. Push authentication is already enabled.

- Endpoint: `https://api.nemoryai.com/iap/pub-sub`
- Audience: `https://nemoryai.com/api/iap/pub-sub`
- Service account: `play-iap-server@nemoryai-publisher.iam.gserviceaccount.com`
- Wrapped payload; payload unwrapping disabled.

The audience is intentionally checked against the configured value, not inferred from the request host or endpoint. These URLs differ and that is supported by Google. No Google Cloud change or additional private key is needed for this fix.

## Local implementation

`GooglePubSubAuthGuard` protects only POST `/iap/pub-sub`, before controller decoding/logging/dispatch. It uses the installed google-auth-library verifier to validate the JWT signature, Google issuer, audience and token times. Expected service-account email and boolean email_verified=true are also required. Google's public certificates are cached by the library; no scheduled purchase polling is introduced.

The authenticated notification must contain the configured GOOGLE_PLAY_PACKAGE_NAME (existing default `com.soniac12.nemory`), including voided/test notifications. Missing/malformed authorization or invalid identity returns 401; wrong/missing package or malformed payload returns 400. Missing required auth configuration returns 503, without executing a billing handler. Certificate-fetch failure also rejects the request (401); Pub/Sub can redeliver non-2xx responses. No raw JWT, payload or verifier error is included in the guard's errors/logs.

Existing legacy/V2 subscription handlers, credit purchase/refund logic, row locks and idempotency remain unchanged. NA-13 (V2 processing failure acknowledgment) is a separate pending finding. Local JWT tests do not prove production IAM, proxy forwarding or Google delivery.

## Deployment — user performs

Before deploying/restarting the updated backend, add these values to its effective environment (also provided in `.env.iap.example`):

```dotenv
GOOGLE_PUBSUB_AUDIENCE=https://nemoryai.com/api/iap/pub-sub
GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL=play-iap-server@nemoryai-publisher.iam.gserviceaccount.com
```

Keep the existing Google Play package configuration. Do not replace the audience with the different endpoint URL. No frontend rebuild, database migration, new credential file or unsigned fallback is required. Ensure the existing reverse proxy forwards Authorization; verify via the test below rather than logging its contents.

## Automated tests

29.10.2026: **75 tests PASS / 4 suites**, TypeScript `--noEmit`, scoped ESLint and `git diff --check` PASS. No production changes or real Google/credit operations were performed.

`src/iap/google-pubsub-auth.spec.ts`: actual HTTP route, guard and Google JWT verifier; local RSA signing/public key fixture substitutes only certificate retrieval, no external Google requests. Tests cover missing/malformed/unsigned/forged signature, expired/future/missing-expiry JWT, wrong issuer/audience/account, unverified email, missing configuration, wrong packages in all notification branches, missing package/malformed JSON, authenticated test/subscription/one-time notifications, public-certificate retrieval recovery, and storage-failure redelivery.

The duplicate-refund HTTP test invokes the real CreditPurchasesService refund method against synthetic repositories and proves one ledger entry / one credit debit after two authenticated deliveries. Existing IapController, credit-refund-reconciliation and credit-purchase-terminal-state suites cover compatibility and refund behavior.

## Necessary manual tests

**NA12.2 — ВІДКЛАДЕНО до перевірок після деплою за прямим проханням користувача 29.10.2026.** Зараз не виконувати; не позначати пройденим. Сценарій повернення з Revoke наведений нижче.

**NA12.1 — PASS, 29.10.2026.** User supplied production journal output after the deployment/test instructions: `kind:"test"` reached `received` and then `acknowledged` with the same messageId. Backend processing is confirmed by the supplied logs; no separate nginx output was supplied. NA12.2 remains pending.

1. **NA12.1 — real authenticated delivery, no purchase:** after backend deployment, Play Console → Nemory → Monetize with Play → Monetization setup → Real-time developer notifications → Send Test Message. Expected server log: `[IAP RTDN] received` with `kind:"test"`, then `acknowledged` with the same messageId; nginx POST `/iap/pub-sub` returns 200. A successful publish message in Play Console alone does not prove backend acceptance. If rejected, inspect HTTP status and effective audience/email/proxy settings; do not disable authentication.
2. **NA12.2 — real refund notification:** on an available Google Play **test** credit order not yet refunded, refund with **Revoke** enabled. Expected RTDN `voided` or cancellation `one-time` delivery acknowledged, purchase becomes REFUNDED, grant is revoked once and the app shows the refreshed balance. Repeated app refresh must not deduct again. Do not refund a real customer's purchase for this test. Reuse a suitable existing test order; do not purchase solely for the connectivity test NA12.1.

No manual forged-token or expanded trial/onboarding matrix is needed.

References: [Google push authentication](https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions), [Google Play RTDN setup/test](https://developer.android.com/google/play/billing/getting-ready).
