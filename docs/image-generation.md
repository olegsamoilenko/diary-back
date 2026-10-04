# Conversation image generation — 23 September 2026

Accepted scope: a user asks for a new image in an entry/check-in conversation; the assistant proposes a description; the app displays approximate credits and starts generation only after an explicit button press. This is text-to-image, not editing an attached photo. Periodic-analysis conversations are not enabled in this first integration.

## Existing mechanisms extended

- `generateComment` accepts the optional final `imageGenerationSupported` capability (default false). Only capable dialogue clients with `AI_IMAGE_GENERATION_ENABLED=true` receive the action instructions in the common prompt builder's dynamic suffix. The shared cached source prefix and existing clients remain unchanged.
- All conversation providers can emit the same final `nemory-image` JSON fence containing a self-contained `prompt`. It is a persisted proposal, not a native provider tool call and not authorization to spend. Ordinary text streams/events remain compatible.
- Authenticated `POST /ai/images/quote` accepts `{prompt}` and returns the server-owned estimate. `POST /ai/images/generate` accepts `{id,prompt}`; `id` is the saved assistant message UUID. `PlanGuard` and `AiCreditCycleId('id')` protect generation. `GET /ai/images/:id` recovers state/result without requiring a new paid cycle.
- `AiService.executeResponse` dispatches this request to `ImageGenerationService`, using the existing OpenAI client and `persistAiUsage` → `SubscriptionUsageService`. Both legacy plans and V2 plan/wallet/debt rules remain active. Image generation never uses the conversation model's price.
- `ai_media_assets` stores the encrypted result and durable claim, owned by the authenticated account. Its text status field supports `generating`, `generation_billing_pending`, `generated`, `generation_failed`. No additional media table or storage service.
- Claim insertion is atomic across workers. The same ID/prompt returns the existing result/state. Another owner cannot read it; another prompt cannot reuse the ID. Generated assets cannot be removed using the analysis-upload deletion route, so that route cannot reset paid idempotency.
- The provider result is retained before billing. Provider retries are disabled. Unknown provider outcomes and uncertain billing are not automatically repeated. `generation_billing_pending` needs operator reconciliation against token history/wallet before manually changing state; never blindly retry a debit. A generating claim older than five minutes is shown as needing review, without another provider call.

## Provider and pricing

`gpt-image-2.5-flare`, one 1024×1024 JPEG, medium quality. Text-to-image input costs $5/M tokens and image output $30/M, converted with the existing 10,000 credits/USD catalog. The displayed estimate uses 439 output tokens plus prompt bytes/3; it is a planning estimate, not a price guarantee or the debit amount. The output estimate is keyed to model/size/quality. OpenAI's interactive image-generation calculator was checked on 23 September 2026 with GPT Image 2.5, medium, width/height 1024: 439 tokens, $0.01317 before input. This replaces the incorrect 1,800-token assumption (540 output credits) with 132 rounded output credits plus estimated prompt cost. Actual validated provider input/output usage remains the billing authority. No image input/edit tariff is used because no source images are sent to this generator.

The assistant's text proposal and the confirmed image generation are separate operations: `generate_dialog_response` uses the selected conversation model, while `generate_image` uses Flare. Do not compare the proposal's output token count to the image estimate. Read-only inspection of the first test confirmed the persisted image accounting matches the current tariff; no historical debits or wallet data were changed. Regression coverage checks the configured quote and ensures an actual 195-token provider result would bill 59 output credits, independent of the 439-token estimate.

Quote correction validation: 42 tests passed across image-generation and shared response-billing integration suites (including legacy/V2 usage); scoped ESLint and diff checks passed. No paid provider request was made. Exact fresh/cached input and output token counters for the coding task are unavailable.

Verified sources: [model](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare), [image guide](https://developers.openai.com/api/docs/guides/image-generation). Model availability was checked with the configured backend key using a read-only Models API call; this does not establish successful image generation or account verification for that endpoint.

## Deployment and recovery

The initial `GET /ai/images/:id` probe returns HTTP 200 with an absent body/null when this account has no generated result. This is an expected state before confirmation, not a 404 exception or an AI-error alert. Missing, inaccessible and non-generation assets are indistinguishable; owner filtering remains enforced. Frontend retains old-backend 404 compatibility. Actual storage/authentication failures are still reported normally.

Apply migration `1790164800000-AddImageGenerationModel` before enabling `AI_IMAGE_GENERATION_ENABLED=true`. The flag is off by default; existing generated results remain recoverable when disabled. The workspace `.env` was enabled after a read-only check confirmed the token-history enum value already exists. No credentials are included in documentation or logs. Metro was not restarted.

Do not delete the durable asset claim to retry a failed generation. A new proposal/message represents a new user-confirmed request. Account deletion cascades to the encrypted assets.

## Validation and remaining check

Focused tests cover ownership, atomic claims, repeat requests, uncertain provider/billing outcomes, feature gating, prompt compatibility, PlanGuard, legacy and V2 accounting. Frontend tests cover the confirmation boundary, recovery without generation, account changes, persistent attachments, deletion, history provenance, Markdown and existing backup contracts.

Final checks: both TypeScript checks passed. Backend generation/prompt suites: 19 passing tests; shared billing suite: 32 passing tests; gateway compatibility suite also passed. Frontend active entry/check-in/detail consumers: 122 passing tests; dedicated persistence/protocol/history/rendering/backup suites also passed. Scoped ESLint passed for the new implementation; the touched existing `apiClient.ts` retains three unrelated warnings (unused AxiosHeaders/type parameter and Axios default-import style). `git diff --check` passed. The running local image route returns 401 without authentication. A single USB screenshot confirmed the Today screen is running without an error overlay; it does not validate the new image action visually.

Paid provider generation and the final new-image phone flow have not been run. The remaining acceptance check is one user-confirmed image request, then reopen the chat, inspect full-size viewing, ask a follow-up about the image, and restore a matching DB/media archive. No private journal content was sent in the read-only model availability check.

Usage ledger: exact fresh input/cached input/output counters for this coding task are unavailable. No API-equivalent cost is inferred from account quotas. Paid provider generations executed by the agent: 0.
