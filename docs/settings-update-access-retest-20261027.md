# BUG-N6-14 — settings ownership protection, 27 October 2026

Status: implemented locally; SEC14.1 narrowed settings-save scenario accepted by user on DEV, 28 October 2026. Production deployment is not confirmed.
User authorized this fix separately. Overnight regression remains stopped.

## Change and compatibility

`POST /users/update-settings` still uses the authenticated JWT user's ID to load
settings. Before applying the update, UsersService now projects an explicit list
of editable preference fields through `pickEditableUserSettings`. Incoming `id`,
`user`, `userId`, unknown fields and device identity/metadata cannot reach writes.
The saved primary key is additionally assigned from the server-loaded row.
This applies to direct service calls as well as the HTTP route.

The allowlist retains theme/themeSelection, font, language/conversation language,
date/time/first weekday, AI preferences, notifications, calendar icon preferences,
legacy diaryTabEnabled, timezone, metrics/check-in settings, onboarding attribution
and version/build refresh. `initializeThemeSelection` remains a control flag only.
The existing ignored diaryTabVariant behavior is preserved. Explicit nulls retain
their existing validation semantics; undefined and inherited properties are omitted.
Unsupported-only requests are no-ops. This is an ownership/field-selection fix,
not a replacement of every scalar-setting validation rule.

Existing validators for theme, metrics, check-ins, onboarding, media analysis and
AI defaults remain in place. Theme initialization and onboarding attribution still
use conditional updates on the server-selected row; ordinary saves cannot restore
stale copies of those two fields. The response contract and partial updates remain.

Current consumers checked: settings controls, initial guest preferences, community
notification opt-in, conversation language, font selection, metric/check-in save
thunks, theme synchronization, onboarding attribution and useUpdateLastActive build
refresh. Historical build269 (`d1425f2a`) uses partial theme/language/date/time/AI/
notification/diary visibility updates, all retained. No landing caller of this
endpoint found. Device fields uniqueId/platform/locale/model/osVersion/osBuildId
belong to separate account creation/sync flows, which were not changed.

Production source changes: `src/users/types/editable-user-settings.ts` and the
existing `UsersService.updateUserSettings` in `src/users/users.service.ts`.
No migration, new environment variable or mobile/landing rebuild is needed.

## Automated verification

184 unique cases passed: settings ownership HTTP57, existing UsersService54,
profile protection HTTP73. Tests use a real local HTTP/JWT/controller/service path
with synthetic rows and repositories; no real PostgreSQL or deployed account
mutations. Existing settings tests cover theme, onboarding and defaults.

TypeScript noEmit and diff check passed. New-file ESLint passed. Initial test
compilation caught a string fixture used instead of the Font enum; corrected
before the successful HTTP run. Results: `.tmp/overnight-20261027/bug14-results.json`
(127 existing cases pass, initial new-suite compile failure) and
`bug14-settings-results.json` (all57 new cases pass). No application assertion
remains failing in these suites. These results are not phone/manual acceptance.

## Tests after backend deployment

**SEC14.1 is PASS DEV for the issued font/time-format scenario**; SEC14.2–SEC14.7 have no manual acceptance. Use disposable QA accounts and an isolated test
environment for API mutation checks. These cases are not a claim of phone acceptance.

28 October 2026: user explicitly confirmed "SEC14.1 пройшов". Issued steps: change font and time format, leave and reopen Settings; both persist, other preferences remain unchanged and no errors appear. This accepts that current DEV scenario, not every language/date/weekday variation or previous-client matrix in the original extended row below. Follow the user's essential-tests-only scope; do not require redundant manual repeats without a relevant change.

| ID | Check | Expected |
| --- | --- | --- |
| SEC14.1 | On current and previous supported clients change language, font, time/date formats and first weekday; reopen settings. | Values persist, unrelated preferences stay unchanged. |
| SEC14.2 | With two QA users, send an authenticated settings update from A containing B's settings id, B's user/userId and an allowed language value. Inspect both persisted rows. Repeat with a nonexistent target ID. | Only A's language changes; A's identity/owner stays the same, B stays unchanged and no new row is created. |
| SEC14.3 | Send only id/user/uniqueId/platform/unknown fields, then try the route without JWT. | Authenticated unsupported-only request changes nothing; unauthenticated request fails before writes. |
| SEC14.4 | Change theme explicitly, then synchronize from another device. Attempt initial theme/onboarding setup after a choice already exists. | Explicit theme persists; initialization does not overwrite an existing choice or attribution. Older-client font changes preserve themeSelection. |
| SEC14.5 | Change calendar markers, notification preference, AI defaults and media-analysis choice; save metrics and check-in templates. | Supported preferences persist independently and render correctly. Invalid structured payload causes no partial save. |
| SEC14.6 | Launch after upgrading a QA app build. | App build metadata updates as before; device identity and other settings stay unchanged. |
| SEC14.7 | On an isolated test backend simulate persistence failure or absent settings for the authenticated QA user. | Error is returned, with no fallback to an incoming target ID and no false successful save. |

Other regression findings are outside this fix. BUG07 and BUG12 remain separately
implemented and awaiting their own deployment/manual checks.
