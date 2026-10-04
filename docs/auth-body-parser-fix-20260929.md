# Startup and Google sign-in JSON regression — 2026-09-29

Observed after the user deleted only the phone's local SQLite database. That
action does not clear the SecureStore account/session. Server HTTP logs showed
refresh validation reporting every required field missing and Google sign-in
throwing while reading `userId` from an undefined body.

Root cause: the route-mounted Express `json({ limit: '1mb' })` middleware added
for `/ai/periodic-analyses` caused Nest's Express adapter to detect `jsonParser`
as already registered and skip its global JSON parser. Other JSON routes then
received undefined bodies. The installed adapter reproduces this with a small
valid JSON request; no database reset is necessary.

`src/common/configure-body-parsers.ts`, called by `src/main.ts`, now registers
the period parser first and explicitly registers the standard global JSON parser
afterward. Other routes retain the default 100 KB limit; periods retain 1 MB.
Default URL-encoded handling stays with Nest. Account lookup and validation are
unchanged.

Validation: six HTTP regression tests through an isolated Nest application pass
(both auth route bodies, large period request, both size limits, URL-encoded
body). Backend TypeScript passes. The initial lint found only two formatting
issues in the new test, which were corrected. Live backend probe connections
closed without an HTTP response, so actual phone login remains unverified.
Next: ensure the running backend has reloaded this change, then retry startup
and Google sign-in. No account or device data was cleared during diagnosis.
