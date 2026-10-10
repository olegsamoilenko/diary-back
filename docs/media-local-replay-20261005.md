# Local media replay and seven-day server retention

Decision, 5 October 2026: keep prepared AI media locally, remove temporary server copies after seven days, and restore them when the user continues a dialogue. This extends prepareEntryAiMedia → media IDs → MediaAnalysisService; no prompt/provider/billing redesign.

## Contract

- `GET /ai/media/:id/replay` exports an opaque AES-GCM authenticated, account-bound snapshot of prepared images/video frames and the already-paid transcript. Only ready assets without pending audio can be exported. ID/hash and metadata are inside the authenticated envelope.
- The app writes to its private document directory, reads back, then calls `POST /ai/media/:id/replay/ack`. Account/asset paths are validated; parallel exports are deduplicated. Failed downloads/writes do not acknowledge expiry or block an otherwise available analysis.
- Acknowledgement sets nullable `expires_at = created_at + 7 days`. Reads/repeated acknowledgements do not extend it. Hourly cleanup deletes expired ready rows (up to one hour of scheduler delay during normal operation).
- On a later status 404 the client posts its snapshot to `POST /ai/media/:id/replay?model=...` as a multipart file. Backend verifies authenticated AAD scope, owner, ID, feature switches and model, then restores the same ID as ready. No conversion/transcription/transcription charge occurs; normal model input/output charges remain unchanged.
- The shared prepareEntryAiMedia path covers entry/check-in source media and dialogue attachments, including Conversation and periodic dialogue consumers. Original local files are unchanged.
- Existing encrypted backups now include snapshots alongside replay metadata; metadata-only older backups remain readable. Local snapshots are removed after entry/account deletion and remain across ordinary logout/relaunch.

## Compatibility and limits

This is not universal seven-day deletion of all existing server data. Released clients cannot restore expired used assets. Old rows keep expires_at NULL until a new client has saved a local snapshot. Legacy assets are migrated lazily on reuse, not mass-deleted. Any older installation using an acknowledged asset may lose replay after expiry; update active installations before relying on this lifecycle. Old backups without snapshots cannot recover already-expired paid audio: the client fails without silently charging for transcription again.

Unused prepared uploads retain their existing 24-hour cleanup. Transcribing, billing_pending, failed and image-generation states are excluded: deleting these blindly could lose billing-recovery evidence or generated outputs. Unacknowledged/incomplete media still have no new automatic deadline. A full legacy/incomplete-data purge requires a separate migration/recovery decision.

Clearing app data without an updated backup also removes local snapshots. Deleting active DB rows is separate from retention of database backups or AI-provider data. Seven-day storage remains persistent processing, not RAM-only ephemeral processing.

## Deployment and validation

1. Apply migration `1791200000000-AddAiMediaReplayExpiry` before backend code which selects the new column. It adds schema/index only, with no bulk payload deletion.
2. Deploy backend and updated client. Catalog localReplayVersion=1 gates the new client path; older servers remain supported.
3. With a synthetic attachment in a test environment, verify analysis → local snapshot → acknowledgement. Delete only that test server asset, reopen and continue: same ID/image/transcript, no repeated transcription debit. Repeat with restored encrypted backup and account switch. Do not alter a real user's clock or delete their attachments for testing.
4. Verify hourly scheduler and align public privacy text with actual rollout and legacy exceptions.

Automated verification: backend media 36 + replay 8 tests; frontend media/cache 35 + entry-association 23 tests. Both frontend/backend TypeScript and scoped ESLint passed. Synthetic data only; no paid provider requests (application fresh/cached/output tokens all 0). Codex token usage is not available from these checks. Migration, deployment and phone verification were not performed.
