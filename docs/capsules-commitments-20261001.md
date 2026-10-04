# Capsules, commitments and local reminders — 1 October 2026

User authorized the combined patch after the audit, explicitly chose phone-only reminders, and asked to retire agreements whose conditions have ended. Memora2737 supersedes the earlier discussion-only restriction. Existing entry/check-in extraction, common response builder/executeResponse, local commitment repository, calendar-reminder repository and native scheduler remain the shared implementations. No screen redesign or paid replay was performed.

## Commitment lifecycle and context

- Preserve every accepted active agreement, including importance1–2. Reserve the entire active block before optional records/Q&A/independent memory in ranked and fallback selection. Render it first. Nominal entry memory budgets remain6000/9000/12000; if the mandatory block alone exceeds the budget, retain it and report the actual token overage. Provider limits still exist: this is not unlimited model capacity.
- One explicit later action is `one_time`; repeated/continuing agreements are `ongoing`. A single occurrence never fulfils an ongoing agreement. Fulfilled one-time actions, explicit cancellation and replacement leave the active set.
- Optional local `expires_at` is derived from an explicitly supported ISO timestamp, not a default TTL. Reads exclude a passed deadline immediately; later commitment persistence marks it `expired` with `resolved_at=expires_at`. It is never marked fulfilled just because time passed. Existing local history is retained.
- Conditional endings such as completion of a project require new user evidence; extraction emits an update with a concrete reason. Age, silence and one successful occurrence are not evidence. This remains a model judgement governed by the prompt, not a semantic proof enforced by code.
- Same-key replacement closes the old row before inserting the new row. Exact duplicates remain suppressed. Historical seed reads use the requested instant and resolved/expiry timestamps.
- Reused entry/check-in dialog snapshots refresh the active block even within30minutes; source history and its original as-of time are retained. Periodic summary inputs and periodic dialogs also receive active agreements, with a fresh dialog list explicitly overriding older snapshots.

Existing rows without structured expiry are not retrospectively guessed or rewritten. They can be retired by the next evidence-based extraction; there is no paid background reprocessing of old history.

## Timed reminders

New reminders use existing `calendar_reminders`/alerts and Expo notifications. The local primary key encodes source/action identity; no new reminder table or server content write. Cancellation uses an exact active local key. The shared scheduler reads the latest row under its lock, and the Nemory path checks account ownership across OS awaits and local writes.

The response acknowledges an attempt; app-owned success/error feedback appears only after scheduling or cancellation. Denied permissions and scheduling failure do not produce a success confirmation. A saved-but-unscheduled reminder remains editable locally. Conversational commitments apply during a later user interaction; they do not enable autonomous monitoring.

Periodic summaries and dialogs use the existing Luna extraction endpoint with `actionsOnly=true`, keeping period capsules separate. This adds an auxiliary extraction call for these responses; it is not free and uses the normal provider/usage pipeline. Short-source compression policy does not disable action extraction.

Compatibility: old server reminder APIs stay available for released clients. A new client provides its local active list (including an explicit empty list), so extraction does not read server reminders for that request. Legacy transfer creates/schedules locally, confirms local scheduling to suppress server fallback, deletes the owner's server row, then cancels the old OS schedule. Failed local scheduling preserves the server copy for retry. Finished/past pending server history for that owner is removed by the transfer endpoint. Deploy backend routes before shipping the new client. These code changes have not migrated or deleted any real records during development.

## Compression policy for comparison

Start with originals for source/response prose of500 tokens or fewer; ask Luna for an empty digest rather than a generated copy. For longer source/response prose, aim at50–65% by compacting each semantic unit, preserving separate events, actions, emotions, decisions, explanations and attributed hypotheses. Accept a candidate only with at least20% token reduction; otherwise keep original prose. Keep source date/mood/metrics once through the existing code formatter. No automatic paid retry was added.

Dialog user prose follows the same source policy; response summaries preserve mechanisms and emotions. Remove the500/700-character truncation of the main question/answer capsule in normalization, persistence and readback. Separate small durable-memory arrays retain their existing limits. Token/size checks do not prove semantic fidelity; evaluate with the next controlled replay and downstream answers. Existing durable-user-memory extraction still incurs its input/output costs on short records.

Diagnostic audit logs include original, candidate selection and token counts; no real replay was run here. Prompt history: `docs/prompt-history/20261001-capsules-commitments/`.

## Validation and remaining checks

- Frontend targeted suites passed for ranked/fallback priority, capsule persistence, saved-context refresh, lifecycle migration/repository, local notification scheduling/cancellation/ownership, legacy transfer, period actions, service and recovery. Scoped ESLint passed; final frontend TypeScript passed. No device delivery/visual acceptance claimed.
- Backend focused tests passed for compression policy, response prompt capability, reminder ownership/cleanup and extraction/normalization. Broad legacy capsule suite exposes older stale tests for removed diagnostic/discipline helpers, a previous prompt assertion and a billing argument; no blanket all-suite pass is claimed. Full backend TypeScript remains blocked by pre-existing TS2589 in `src/ai/media/image-generation.service.ts:109`.
- Backend diff check and changed frontend paths pass. Workspace-wide frontend diff check also reports existing blank EOF lines in two unrelated seed documents; they were left untouched.
- Next: verify one-time local delivery, cancellation, denied permission and account-switch behavior on a phone; compare new short/long capsule coverage and context quality. Do not retune all tariff budgets before this evidence.
- Model API usage for this work: fresh input0, cached input0, output0, app credits0. Codex account tokens/quota are separate and not measured here. No Metro restart, deployment, database drop or seed execution.
