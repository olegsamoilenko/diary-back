# Generated image retention — 5 November 2026

## Accepted scope

Remove unnecessary server copies of model-generated images after seven days,
without changing generation, pricing, local display, or input-media replay.
The server copy supports initial delivery and recovery after interrupted delivery;
the app displays its saved local file first.

## Implementation

- `src/ai/media/image-generation.policy.ts`: seven-day retention constant.
- `src/ai/media/image-generation.service.ts`: hourly cleanup at minute 5.
  Completed generation rows older than seven days have their encrypted payload
  replaced with an empty JSON object. `expiresAt` marks completed purging.
  The ID, owner, request hash and completion status remain: deleting the row
  would allow the same request to generate and charge again.
- Old `generation_billing_pending` rows retain encrypted measured usage only.
  Their image bytes are removed, while uncertain billing is not retried. The
  update compares the original payload and pending status to avoid overwriting
  concurrent billing completion. Each sweep handles at most 100 pending rows;
  decryption/encryption failures fail the sweep and are retried on a later run.
- Reading a purged completed image returns the existing client-compatible
  `generation_failed` status with the additive reason `IMAGE_RESULT_EXPIRED`.
  Existing clients block paid retries for that state. The database row itself
  remains `generated`.
- No schema migration or mobile production-code change. The existing
  `AiModule` provider and application scheduler run the cleanup.

## Boundaries

- Saved local images remain available. If delivery never completed, or the
  local file is lost, server recovery is unavailable after purging. Existing
  clients show their generic review message for this condition.
- Retention is enforced by a scheduled sweep, not a precise seven-day timer;
  scheduler downtime, pending batches or KMS failures can delay removal.
- In-progress generation is untouched. Input images/audio/video keep the
  existing replay-acknowledgement cleanup, including compatibility with clients
  without a confirmed durable local replay copy.
- This changes live database payloads only; it does not rewrite historical
  database backups or control an external AI provider's retention.
- Terms and Privacy were not edited. No production deployment or paid model
  request was performed.

## Verification

Tests cover expired-payload removal, fresh/in-progress/input isolation,
idempotency, owner and hash checks, pending billing usage, a billing race,
local display after server expiry, and blocking automatic paid retries.
Frontend additions are in
`diary-front/tests/unit/components/diary/ImageGenerationAction.test.js`.

Separate existing test-fixture issues observed during the wider checks:

- `media-cache-usage.spec.ts` mocks `openai.chat.completions`, but its selected
  model follows the Responses path and needs `openai.responses.create`.
- `prepareEntryAiMedia.test.js` supplies a Redux account but no stored local
  vault owner; three backup tests fail with `LOCAL_ACCOUNT_LOCKED`.

Those production paths and tests were not changed by this task.

Final results:

- Backend `npm run typecheck` and scoped ESLint: passed.
- Backend generation: 27 tests passed, including the four new retention tests.
- Backend analysis and replay: 46 tests passed.
- Frontend component/API/local-cache suites passed; the wider four-suite run
  had 64 passing tests and the three separate local-vault fixture failures.
- The separate backend cache-usage suite had the two fixture failures above.
- Scoped `git diff --check`: passed in both repositories.
- Scoped frontend component-test ESLint: passed.
- No device verification, production database cleanup or deployment performed.

Next step: deploy the backend through the normal release process. No mobile
release is needed for this retention change. A lost/not-downloaded local image
is intentionally no longer recoverable from the server after purge.

Usage ledger: exact fresh-input, cached-input and output/reasoning token counts
were not exposed for this task. No API-equivalent cost or account-quota change
was calculated.

## Manual Android verification — 2026-11-05

Tested on the connected Android app against local PostgreSQL. No application
code changed. Created a dedicated synthetic mug-image conversation.

- Generated a red mug and opened its full-size local image.
- Simulated seven days for only that test asset, invoked the real
  `ImageGenerationService.cleanExpiredResults` with a repository restricted to
  its ID, and restored its actual creation timestamp. Payload was cleared;
  ID/hash/owner/status remained. Result returned `IMAGE_RESULT_EXPIRED`.
- Left and reopened the conversation: thumbnail and full-size image still
  worked, with exactly one original generation charge.
- Edited the mug to blue using its local history after server purge. The
  displayed result retained the composition and changed the color correctly.
- Confirmed the replay copy's expiry is seven days from creation and repeated
  acknowledgement does not extend it. Simulated expiry of only that test copy
  and invoked real `MediaAnalysisService.cleanUnused` with ID-scoped deletion.
- Sent a subsequent question about both images: the deleted replay ID was
  restored from local storage, and the response correctly identified red/blue.
  No additional image-generation charges occurred.

**Issue found:** the expected GET `/ai/media/:id` 404 before successful local
replay restoration triggered an AI SERVER ERROR Telegram alert. Frontend
`utils/media/prepareEntryAiMedia.ts` explicitly handles this 404, but backend
`shouldReportAiHttpError` reports authenticated AI 404s. This is a monitoring
classification defect, not a failed replay. The initial manual test left code
unchanged; the user subsequently authorized the focused fix below.

This is simulated-expiry verification, not a seven-day wall-clock soak or a
production deployment. Lost local files and billing-pending failures were not
manually exercised. Evidence screenshots and isolated local test harnesses are
in each repository's `.tmp/image-retention-*` files.

Nemory API usage ledger for this manual test (history rows 5260–5267): 19,306
total input tokens, including 4,537 cache reads and 9,132 cache writes; fresh
input excluding cache reads is 14,769. Output: 1,364. Total: 662 app credits,
of which 135 original generation + 218 edit = 353 image credits and 309 text/
action-extraction credits. Codex token usage is not exposed; these figures are
actual Nemory history entries, not Codex usage or API-equivalent estimates.

## Expected media-status 404 alert fix — 2026-11-05

`MediaAnalysisService.status` now throws an internal
`MediaStatusNotFoundException` only when the owner-scoped lookup has no row.
It retains the existing Nest 404 response body. `CaptureErrorFilter` recognizes
this class (not request parameters or a blanket URL exception) and passes the
classification through the shared AI error predicate and HTTP log middleware.
The expected miss remains a warning in HTTP logs without a Telegram alert.

Other NotFoundExceptions, replay export/restore errors, provider failures and
5xx errors retain existing alert behavior. No client release, database migration,
generation, retention, ownership or billing change is needed. Production
deployment and on-device verification of this alert fix have not been performed.

Regression coverage uses the real media status service, HTTP controller, global
exception filter, reporter and logging middleware, with repository and Telegram
transport mocked: unchanged 404 body/no alert followed by successful replay
restore, ordinary 404 and 500 on the same status endpoint still alert, adjacent
replay-export 404 still alerts, and marked 500 remains reportable.

Validation: 27 tests passed across media HTTP compatibility, replay and AI error
reporting; backend typecheck, scoped ESLint and diff whitespace checks passed.
The first Jest attempt was blocked by sandbox cache-file permissions before any
test ran; the successful rerun used an explicit local cache with approved access.

Usage: no paid AI calls or real Telegram messages for this fix. Exact Codex
fresh-input/cache/output counters are unavailable.

## Live Android alert-fix retest — 2026-11-05 11:55 Kyiv

PASS against the running local backend (source process restarted after the fix).
Reused the synthetic red/blue mug conversation; no new images generated.
The real cleanup method, scoped to only the red mug's test replay ID, deleted
the temporary server copy after simulated expiry. Its absence was verified
before sending a question about which side each mug handle was on.

- Actual status probe returned 404 at 09:55:34.918 UTC. HTTP log 1121 records
  `MediaStatusNotFoundException`, level `warn`; the prior pre-fix event 1120 was
  `NotFoundException`, level `error`.
- The same replay ID was restored and ready at 09:55:35.405 UTC, with expiry
  seven days from the new upload. No additional image generation was charged.
- Android displayed the correct answer: handles are on the right in both images.
- User explicitly confirmed no new Telegram message after the 11:55 test.

No application code, production data or deployment changes in this retest.
Evidence: `.tmp/image-retention-alert-retest.cjs` and frontend
`.tmp/image-retention-alert-retest-*.xml`. Actual Nemory usage rows 5270–5271:
30 credits for the text response/action extraction, zero image-generation
credits; total input 7,579, cache reads 6,040, fresh input 1,539 (including 111
cache-write tokens), output 67. Exact Codex usage is unavailable.

## Released-client 284 compatibility test — 2026-11-05

Manually tested on Samsung SM-A715F against the modified local backend, using
frontend release commit `b5a6cc13`, version 2.0.3/build 284. The APK was rebuilt
in the isolated `D:/Nemory/Projects/qa284` directory for ARM64, with local USB
API routing, test signing/test ads and OTA disabled. This is not the exact
Google Play-signed artifact; Play Billing and production Google login were
not tested. Two Git-ignored Kotlin plugin templates were copied from existing
files with timestamps preceding the release. Current `diary-front` status and
diff remained identical to the pre-test baseline, verified after the run.

The user installed the QA APK and added 5,000 credits to the new local test
account (ID 140). No real purchase or production deployment was performed.
The account had no active subscription; actual calls successfully consumed its
purchased-credit wallet. The final plans/credits screen displayed 3,933, matching
the database wallet exactly. Synthetic entry `QA284` was saved and displayed its
AI response. A normal dialog continuation succeeded. Web search displayed a
source link and opened the official site; one call was recorded separately as
100 `webSearchCredits`, not included in `inputCredits`.

Image and retention checks passed:

- Red mug generation and full-size viewing succeeded. Generation ID:
  `999a9e21-991f-41e0-a7f1-eeeec43ba190`; charged once, 136 credits.
- Analysis identified the red color. Build 284 saved/acknowledged its replay
  `9900e35b-0cc8-4dbf-ac2c-5c2e904929b8`; expiry was exactly creation + 7 days.
- The real cleanup methods ran with every repository operation restricted to
  those explicit IDs and owner 140. Simulated expiry purged the generated
  payload while preserving the claim, and deleted the ready replay row.
  Repeated acknowledgement did not extend expiry; cleanup changed no charges.
- A verified force-stop/no-process/relaunch preserved the session, entry,
  dialog and full-size local image after server cleanup.
- At 12:46:15.099 UTC (14:46 Kyiv), the old client received the expected status
  404, logged as `warn`/`MediaStatusNotFoundException`. The same replay ID was
  restored by 12:46:15.404 UTC, with a new 7-day expiry. AI correctly answered
  that the handle was on the right. This cost 26 text/capsule credits and no
  additional image generation. The user confirmed no new Telegram alert.
- Editing the restored red image to blue succeeded, retaining its shape,
  white background and right-hand handle. New generation ID:
  `a67f3df0-41aa-44ed-85e2-ef08dd8025bc`; one charge of 218 credits.

Evidence: workspace `qa284-phone-evidence/`,
`qa284-phone-backend-evidence.json`, `qa284-phone-retention-evidence.json`,
`qa284-phone-apk-verification.json`; local harness
`.tmp/qa284-phone-expire.cjs`. The final APK SHA256 is
`2D4E4B6A0478EF6286C115CC466C27BF90E2B7FFF77DDCDEEE9918342890EF66`.

This validates the listed client/backend paths with simulated expiry, not all
app functionality or seven elapsed days. Missing local files, billing-pending
failures and real Play purchases were not manually exercised here. Other
404/500 alert behavior is covered by the earlier regression tests above; no
intentional real server failure/Telegram alert was sent in this device run.
Production rollout still needs both web-search migrations
`1793836800000-AddWebSearchUsage` and `1793865600000-SeparateWebSearchCredits`.

Nemory usage ledger: rows 5272–5291, 76,131 total input tokens; 37,936 cache
reads; 38,195 fresh input excluding cache reads (including 16,978 cache-write
tokens); 4,800 output. Total 1,067 app credits: 354 image generation/editing,
100 web search fee, 613 other model/embedding usage. Wallet remaining: 3,933.
Exact Codex fresh/cached/output usage is unavailable; these are actual Nemory
history values, not Codex billing or API-equivalent estimates.
