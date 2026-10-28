# BUG-N6-16 — diagnostic log read access, 27 October 2026

Status: implemented locally; backend deployment and manual acceptance pending.
User authorized this fix separately. Overnight regression remains stopped.

## Change and compatibility

The three diagnostic read routes now use the existing `admin-jwt` guard:

- `GET /logs/get-logs`
- `POST /logs/get-logs-by-uuid`
- `GET /logs/get-server-logs`

The existing AdminJwtStrategy verifies signature, expiration, admin token purpose
and the current administrator record. Missing or invalid credentials return 401;
an inactive administrator returns 403. Active ADMIN and SUPER_ADMIN accounts retain
access. Ordinary application/community accounts do not gain access through their
role. Both the existing admin_session cookie and admin bearer authentication work.

Client ingestion `POST /logs` is unchanged, including prelogin/guest diagnostics,
DTO validation and the global throttler. Read filters, pagination and response
shapes remain unchanged, including the existing 201 status of the POST read route.

Live consumers checked: diary-landing/lib/api/logs.ts, admin logs/server-logs/
users-list logs pages, user-info and UserLogs. Their same-origin `/api/logs/...`
requests carry the admin_session cookie. No landing source changes are needed.
AppModule registers the existing strategy through AuthModule; main.ts already
uses cookieParser. The deployed reverse proxy was not inspected: verify cookie
forwarding through the real `/api` path during deployment acceptance.

Production source change: `src/logs/logs.controller.ts` only.
Deploy the backend; no new environment variables, migration or mobile/landing
rebuild is required.

## Automated verification

39 tests passed across four suites: new read-access HTTP cases and existing log
context/audit/cleanup tests. TypeScript noEmit, scoped ESLint and diff check passed.
Tests use real HTTP/controller/admin JWT strategy/global throttler with synthetic
logs and administrator records. They do not query production logs or a real
database. The cleanup error printed by its test is an intentionally injected
failure; the independent cleanup assertion passes.

Results: `.tmp/overnight-20261027/bug16-results.json`.

## Tests after backend deployment

All **SEC16.1–SEC16.5 are TODO**. Use QA accounts and synthetic diagnostics.
Automated results do not replace these deployed checks.

| ID | Check | Expected |
| --- | --- | --- |
| SEC16.1 | Without cookies or authorization, request all three read routes through the direct API and landing `/api` proxy. | 401; no diagnostic records returned. |
| SEC16.2 | Repeat with an ordinary app JWT, including a community administrator account. | 401; app/community roles do not grant administrative log access. |
| SEC16.3 | Sign into the admin UI with active ADMIN and SUPER_ADMIN QA accounts. Open client logs, server logs and per-user logs; change search, filters and pages. | Logs load normally; filters/pagination and response shapes are preserved. The deployed proxy forwards the admin cookie. |
| SEC16.4 | Repeat reads after removing/expiring the admin cookie. In a QA environment deactivate an administrator and retry with their still-valid token. | Missing/expired credentials: 401. Inactive administrator: 403, with no logs returned. |
| SEC16.5 | Submit synthetic diagnostic batches through the existing app ingestion path before login and after login; also submit an invalid batch. | Valid batches remain accepted; malformed batches remain rejected. No admin session is required to submit diagnostics. |

BUG07, BUG12 and BUG14 retain separate checklists. Other findings are outside this
fix; no production deployment or manual acceptance is claimed.
