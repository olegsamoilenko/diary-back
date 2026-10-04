# Response length guides, without tariff-derived provider cutoffs

User decision, 3 October 2026: main answers should follow the agreed prompt length guides instead of being interrupted by a small tariff-derived output cap.

## Implementation

- Shared `tier_response` policy omits `max_completion_tokens` for OpenAI/Qwen, in streaming and nonstreaming calls. The media Responses adapter also omits `max_output_tokens` when absent.
- Anthropic requires `max_tokens`. Sonnet 5 and Opus 5 use their published 128,000-token provider maximum, independently of tier and requested answer length. Nonstreaming calls explicitly retain the SDK's normal ten-minute timeout so the SDK does not reject the larger allowed output before sending. Sources checked October 3: [Messages API](https://platform.claude.com/docs/en/api/messages/create), [Sonnet 5](https://platform.claude.com/docs/en/models/sonnet-5/overview), [Opus 5](https://platform.claude.com/docs/en/models/opus-5/overview).
- `estimateResponseOutputTokens` preserves existing preflight affordability and periodic cost estimates separately from provider request limits. Actual usage still determines charges. `estimatedMaxCredits` remains as a compatibility field name; it is an estimate, not a guaranteed maximum now that main output may exceed the guide.
- Entry/check-in, their dialogs, Conversation and all four periodic summaries/dialogs already use `tier_response`; no duplicate pipeline added.
- Lite prompt guides are now 700 tokens for entry/check-in, 600 for dialogs/Conversation and 900 for daily analysis (+100 each). Base/Pro and other periods are unchanged. The old noncompact preferences helper's 2500/2000/1500-character ceilings are replaced with qualitative style and the task-owned token guide. Current live callers already use minimal preferences with length execution disabled.
- Capsule extraction/compression budgets, Qwen thinking budget, context selection, billing records and saved dialog snapshots are unchanged.

## Verification and boundaries

128 tests pass across response-length, Qwen, Opus/Sonnet, periodic provider execution, system prompt and Responses media transport suites. Tests use mocked providers; no paid replay or service restart.

Provider `finishReason: length/max_tokens` now preserves nonempty received answer text. Partial structured JSON is decoded only for answer fields, without inventing an ending. Periodic reports/dialog turns retain `incomplete: true`; compatible request status remains completed. Entry/check-in/dialog persistence receives a localized notice through the shared stream finalizer. Existing Conversation marking remains shared through the same translation. The notice is shown inside the existing answer bubble and survives reopening.

Incomplete answers do not trigger assistant memory/capsule extraction, actions or reminders. No automatic paid retry is added. Empty answers still fail. Network loss before a final provider payload and manual cancellation are separate paths; this change does not promise their recovery.

A same-day entry without a capsule still reaches daily analysis as its full original text; check-ins supply their structured answers. Mood, metrics and planner links remain. Missing assistant memory is omitted; the partial initial reflection is not separately passed as raw text. Daily capsule generation can therefore proceed from the day's original evidence.

Additional mocked checks passed for partial periodic persistence, partial JSON decoding, Conversation, Qwen, frontend periodic reports, stream marking, entry/dialog persistence and action suppression. Frontend TypeScript passed. No phone verification or paid provider requests were performed. Workspace-wide diff check also identifies two pre-existing seed-document blank EOF lines unrelated to this change.

Before-edit source snapshots are in `.tmp/output-policy-before-20261003`; do not restore entire working-tree files indiscriminately because the repository contains unrelated ongoing work.
