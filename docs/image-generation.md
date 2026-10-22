# Conversation image generation — 23 September 2026

Current accepted scope (17 October 2026): a user asks for a new image, an edit of a supplied photo, or a collage in an entry/check-in or conversation. A completed current response uses action=generate for a direct user request, action=offer for an assistant suggestion, or plain text to clarify. Fresh generate actions start with progress and approximate credits; offers require the existing priced button. Reference photos are not duplicated in the answer. Older clients retain confirmation. An attached photo is NOT automatically a reference: only requests which call for using that photo include it. Independent image requests remain text-only. The original integration notes below describe the initial text-only path; the reference extension is documented at the end.

## Existing mechanisms extended

- `generateComment` accepts the optional final `imageGenerationSupported` capability (default false). Only capable dialogue clients with `AI_IMAGE_GENERATION_ENABLED=true` receive the action instructions in the common prompt builder's dynamic suffix. The shared cached source prefix and existing clients remain unchanged.
- All conversation providers can emit the same final `nemory-image` JSON fence containing a self-contained `prompt`. It is a persisted proposal, not a native provider tool call and not authorization to spend. Ordinary text streams/events remain compatible.
- Authenticated `POST /ai/images/quote` accepts `{prompt}` and returns the server-owned estimate. `POST /ai/images/generate` accepts `{id,prompt}`; `id` is the saved assistant message UUID. `PlanGuard` and `AiCreditCycleId('id')` protect generation. `GET /ai/images/:id` recovers state/result without requiring a new paid cycle.
- `AiService.executeResponse` dispatches this request to `ImageGenerationService`, using the existing OpenAI client and `persistAiUsage` → `SubscriptionUsageService`. Both legacy plans and V2 plan/wallet/debt rules remain active. Image generation never uses the conversation model's price.
- `ai_media_assets` stores the encrypted result and durable claim, owned by the authenticated account. Its text status field supports `generating`, `generation_billing_pending`, `generated`, `generation_failed`. No additional media table or storage service.
- Claim insertion is atomic across workers. The same ID/prompt returns the existing result/state. Another owner cannot read it; another prompt cannot reuse the ID. Generated assets cannot be removed using the analysis-upload deletion route, so that route cannot reset paid idempotency.
- The provider result is retained before billing. Provider retries are disabled. Unknown provider outcomes and uncertain billing are not automatically repeated. `generation_billing_pending` needs operator reconciliation against token history/wallet before manually changing state; never blindly retry a debit. A generating claim older than five minutes is shown as needing review, without another provider call.

## Provider and pricing

`gpt-image-2.5-flare`, one 1024×1024 JPEG, medium quality. Text-to-image input costs $5/M tokens and image output $30/M, converted with the existing 10,000 credits/USD catalog. The displayed estimate uses 439 output tokens plus prompt bytes/3; it is a planning estimate, not a price guarantee or the debit amount. The output estimate is keyed to model/size/quality. OpenAI's interactive image-generation calculator was checked on 23 September 2026 with GPT Image 2.5, medium, width/height 1024: 439 tokens, $0.01317 before input. This replaces the incorrect 1,800-token assumption (540 output credits) with 132 rounded output credits plus estimated prompt cost. Actual validated provider input/output usage remains the billing authority. Reference image input is billed separately as described below.

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


## Reference photos — 17 October 2026

- Existing source-entry media consent and explicit chat attachments determine what the text model sees. `MediaAnalysisService` labels each visible photo with its owner-checked `IMAGE_REFERENCE_ID`; videos and omitted visuals do not receive reference labels.
- New clients advertise optional `imageReferencesSupported`. The common prompt keeps previous clients text-only, and asks capable clients to preserve only the selected `referenceIds` in the `nemory-image-edit` JSON proposal (the same parser/action; old clients ignore this marker). It requires references for source-photo edits/collages, omits them for unrelated generation, and asks for missing photos instead of pretending to edit them. This is model guidance; actual selection quality still needs user acceptance.
- Quote/generate accept optional unique UUID `referenceIds` (at most16). The authenticated backend reads only prepared/ready photo assets belonging to the caller, reusing encrypted media storage. Quote returns the selected prepared JPEG previews. The frontend does not render those previews; it validates the IDs/order returned by the server, and refuses an old backend which ignores references. Expired assets can be restored from the existing encrypted local replay; missing references never fall back to text-only generation.
- Confirmed references go to `openai.images.edit` as JPEG files in the same order, using the configured Flare model/size/quality and disabled retries. No references still uses `images.generate`. References extend the durable request hash; old text-only hashes stay unchanged. Existing generated results remain recoverable even after source-reference expiry. No new database schema or parallel media store.
- The Images API reports total input plus text/image input breakdown. Image inputs use80,000 credits/M ($8/M), text remains50,000 ($5/M), output300,000 ($30/M); source: [OpenAI image guide](https://developers.openai.com/api/docs/guides/image-generation#cost-and-latency), checked17 October2026. `tokensToCredits`, token-history credits, legacy plans and V2 wallets share this calculation; recorded total input tokens are not inflated. The encrypted generation result retains observed image-input usage.
- The quote adds a planning allowance per prepared photo (`ceil(width/32)*ceil(height/32)+256` image tokens). This is an approximate budgeting allowance, not an official tokenizer or a maximum price. Actual validated provider usage determines the debit. Inputs are the existing analysis-ready JPEGs (long edge1024), not full-resolution originals.
- No paid provider generation or phone interaction was performed for this extension. User acceptance: attach a photo in an entry/dialog or standalone conversation, request a concrete edit, check that the selected photo is used without duplicating its preview; test a two-photo collage; then request an unrelated new image and check that attached photos are not used as references.

Validation completed: frontend proposal/parser, API, confirmation/recovery and entry/dialog consumers passed; backend image service, media identity labels, capability prompts, legacy/V2 shared billing, token history and credit conversion passed. Both repository TypeScript checks, scoped ESLint and diff whitespace checks passed. No phone or paid-provider acceptance is claimed. Usage ledger: fresh input, cached input and output counters unavailable; paid provider calls by the agent:0. Memora2824.


### Compact action contract — 17 October 2026

The whole live capability block was rewritten, replacing the layered replacements. With references and actions it is 277 o200k_base tokens (previous references block477; minus200, 42%). Text-only compatibility block164; reference-capable confirmation clients230. Optional imageActionsSupported gates the new rules across the common response builder, journal/check-in gateways, conversations and periodic consumers. Saved periodic prompts have the old capability block stripped before one current block is added in memory; stored history is unchanged.

JSON action is generate or offer; clarification has no block. Legacy proposals without action remain manual. Existing fences, photo consent, reference validation, generation endpoint, atomic request claim and billing remain shared. UI execution uses a bounded session-only permit keyed by owner, saved response ID and exact prompt/reference IDs, armed only after a new complete answer is persisted. It expires after5min and is consumed before the first automatic POST. History/backup/restart cannot arm it; failed requests cannot automatically retry. In-progress/generated server results still recover via the existing probe. The action mounts after streaming, preserving its price and progress display without a reference preview.

Validation: backend image-service/prompt-budget/history-replacement/conversation/shared-builder suites pass (81 tests). Frontend action/parser/rendering/stream transport/conversation plus entry/check-in/dialog finalization suites pass; finalization batch92 tests, image action19 tests. Both TypeScript checks pass. Scoped lint passes (two pre-existing duplicate-import warnings in the entry-save hook); diff checks pass. No paid generation, deployment, restart or user phone acceptance. Next: user tests a direct edit, an assistant offer and an ambiguous request. Exact assistant fresh/cached/output usage counters unavailable.

## Standalone conversation visual replay — 20 October 2026

ConversationTurnDto accepts optional validated `generatedMediaIds` alongside
user `mediaIds`. `conversationMessages` adds a user-role image-context message
immediately after the assistant answer that owns these images, matching the
entry/check-in replay convention. The existing media resolver remains responsible
for ownership, preparation status, aggregate limits and provider conversion.
Legacy token-budget trimming removes the entire turn including this evidence.
Older clients remain valid; deploy this backend before the corresponding frontend
starts sending generatedMediaIds. No new image generation or billing bypass.
Local validation is separate from deployment and real-provider/device acceptance.
