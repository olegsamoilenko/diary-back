# Optional media analysis

## Default entry media analysis — 23 September 2026

Account setting `entryMediaAnalysisMode` is `ask` (default), `always`, or `never`, shared by photo/audio/video. The live Settings → Nemory → Model screen reuses SettingsRadioCards and updateSettings; its media section has the same token-based separator as the preceding AI defaults. No separate image-generation preference was added: generation remains an explicit request/confirmation with its credit estimate.

`always` selects all supported source-entry media at send time; `never` selects none; both hide the per-attachment switch panel. `ask` shows the existing switch/estimate plus a question-mark help button. That button opens the shared CenteredDialog and does not toggle consent. Theme colors use V2 tokens; native text and WebView labels support enlarged text. Editor scaffolding (including help) is stripped before persistence. Individual `data-nemory-ai` choices remain intact, so returning to `ask` restores them. Existing content with no individual consent stays off in `ask`.

The preference applies to source media on initial analysis and subsequent dialogues, including already saved entries. Explicit current/historical dialogue attachments bypass it; their estimates remain. prepareEntryAiMedia applies the preference before catalog/file preparation; create/edit retain video jobs using the same selection policy. The backend generateComment adapter independently strips source media for `never`, including older-client requests, while preserving dialogue attachments. Already generated text/analysis is not erased by changing this setting.

Backend user_settings owns the validated varchar field (default ask), with migration 1790187600000-AddEntryMediaAnalysisMode. Partial updates from older clients preserve it. Deploy the backend schema/code with the client; migration execution was not performed manually in this task.

Validation: 56 focused frontend settings/media tests, 78 create/edit/video tests and 64 backend settings/response tests passed; both TypeScript checks and scoped ESLint passed. Connected Android inspection showed all three settings choices and the help dialog in the dark theme. Automatic-mode hiding/restored consent and source-vs-dialogue transport were tested with mocks/DOM; no paid provider call was used. The separator was added after the settings screenshot and has not received a separate visual acceptance.


Backend contract added 20 September 2026. Frontend wiring is a separate next step;
existing clients without `mediaIds` keep their text-only request path.

## Availability switches

Server environment variables (restart the backend after changing deployment env):

```dotenv
AI_MEDIA_IMAGE_ENABLED=true
AI_MEDIA_AUDIO_ENABLED=true
AI_MEDIA_VIDEO_ENABLED=true
```

Each defaults to true when absent; only `true` enables an explicitly set variable.
For photos only, set audio and video to false. These switches control attachment
types: an enabled video includes its sampled frames and speech even when standalone
audio attachments are disabled. No paid media processing occurs without selection.

Authenticated `GET /ai/media/pricing` returns `enabled: { image, audio, video }`
alongside pricing rules and limits, with `Cache-Control: private, no-store`.
The future frontend should fetch it at app startup and hide disabled analysis
options. This does not hide ordinary diary attachments. On fetch failure, keep
media analysis choices unavailable until a successful refresh.

Backend checks the same switches on preparation and before generation, including
references in conversation history. Disabled references produce HTTP 400
`{ code: "MEDIA_TYPE_DISABLED", kind, message }` before transcription/provider
calls. The socket's existing error handling remains in place. The frontend must
omit disabled attachment IDs from outgoing requests (retain them in local data)
and refresh availability when settings change. No silent paid fallback.

## Preparing and selecting attachments

All endpoints require the existing JWT authentication.

- `GET /ai/media/pricing`: server-owned rates, image token rules, limits,
  transcription estimate and feature switches. Frontend can calculate a local
  approximate price immediately from width/height/duration and this catalog.
- `POST /ai/media/estimate`: optional server calculation with JSON
  `{ model, kind, width?, height?, durationSeconds?, hasAudio? }`.
- `POST /ai/media/prepare`: multipart `file`, `id` (client UUID), `kind`
  (`image|audio|video`), `model`. Returns ID, detected metadata, status and estimate.
  Decode/resize is free of model charges; no transcription occurs here.
- `DELETE /ai/media/:id`: delete an owned asset that is not being processed.
- `GET /ai/media/:id?model=...`: authenticated, uncached ownership/status/estimate check for frontend replay. Does not decode, transcribe or charge; missing/other-owner assets return 404. Disabled kinds remain blocked.

Frontend integration (20 September 2026): the diary editor now offers default-off selection and local approximate estimates; generation prepares selected files and dialogs reuse source IDs. New chat attachments remain deferred. See `diary-front/docs/media-analysis.md` for persistence and failure behavior. Deployment/migration and user-led live verification remain separate.

Cache investigation, 20 September 2026: a user-led Terra image entry and first dialog both reported normalized read/write counters of zero. Their first four messages, explicit boundaries and routing key match; image hashes also match. Earlier text-only Terra requests did report writes/reads. Added development-only `provider.usage.raw` events to the existing context-audit files for both OpenAI-compatible stream/nonstream response paths, including response ID/model, cache settings, presence of images and unmodified usage. The next user-led dialog confirmed 3,968 cached tokens out of 4,601 input tokens. Its raw usage omitted the cache-write field entirely: normalized zero is NOT evidence that no cache was created. Cache hits therefore work for this image conversation; the first two misses remain unexplained. Cache policy, prompts and billing normalization were unchanged. No paid replay was performed by the assistant.

Expanded diagnostics for the next entry + first-dialog test: request-file basename is sent as `X-Client-Request-Id` in development. `provider.http.response` records the actual outgoing body hash/settings/message hashes and whitelisted response headers (OpenAI request ID, processing time, API version, content type), never authorization or image bytes. The response stream remains unconsumed by this observer. `provider.response.metadata` records returned model/service tier/fingerprint only when they change. `provider.usage.raw` distinguishes absent counters (`reported:false,value:null`) from explicit zero and retains every usage-bearing chunk. `provider.cache.request_comparison` compares consecutive same-key requests in the current backend process: unchanged leading messages and changed settings, ignoring cache-marker-only changes for content comparison. Its bounded 32-key map is diagnostic metadata, not model cache; after restart compare the retained exact request files instead. The entry JSON format versus plain-text dialog is a candidate mismatch, not a proven cause. No extra provider calls or cache/billing policy changes.

Only prepare selected files; uploading an attachment to the diary does not imply
consent to AI analysis. The future frontend sends `mediaIds: string[]` in the
existing entry/check-in/dialog socket request. For subsequent dialogs, retain
source IDs in `entryContent.mediaIds` and previous user-turn IDs in
`dialogs[].mediaIds`; current-question attachments use top-level `mediaIds`.
Never attach IDs to system or assistant messages. The gateway passes these through
the existing `generateComment` and `executeResponse` lifecycle.

The model receives source images alongside the source text on every relevant
turn, and new images alongside their question. Prepared bytes and transcript are
reused without re-transcription. Provider input/cache charges still apply per
request. Cache hits are provider-dependent, not guaranteed by asset reuse.

## Processing and billing

Starting limits: 25 MiB per file, photos up to 1024 px long edge, videos up to
300 seconds (raised to 5 minutes on 21 September 2026), sampled up to 30 frames evenly across the whole video at 768 px (approximately one per 10 seconds); audio up to 300 seconds. Provider request limits are described below. Source images are
limited to 50 megapixels. Supported decoders include JPEG/PNG/WebP, MP4/MOV,
MP3/WAV/M4A, WebM/Matroska, Ogg/FLAC/AAC; unsupported formats fail preparation.

### Provider budgets and request affordability — 23 September 2026

The approved final policy removes the product limits of 10 attachments per entry,
5 per dialogue message and 40 cumulative images/frames. Only AI-selected source
attachments and explicit dialogue attachments enter the request. `validateMediaIds`
checks shape, UUIDs and duplicates; every asset is owner/status checked before use.
Legacy catalog fields remain for released clients but are no longer server caps;
older clients may retain stricter local checks until upgraded. Pending unused
uploads have a separate operational cap of 1500 and the existing 24-hour cleanup.

Current provider image-block limits (images plus sampled video frames):

| Model / transport | Images per request | Request bytes |
| --- | ---: | ---: |
| Qwen 3.8 Max / Base64 | 250 | No aggregate byte limit asserted here |
| Terra / Luna / Responses | 1500 | 512 MiB |
| Sonnet 5 / direct API, 1M context | 600 | 32 MiB |

Sources: [Qwen vision](https://www.alibabacloud.com/help/en/model-studio/vision),
[OpenAI vision](https://developers.openai.com/api/docs/guides/images-vision),
[Claude vision](https://platform.claude.com/docs/en/build-with-claude/vision).
These are API limits, not the attachment pickers in consumer chat applications.
Prepared JPEG dimensions already stay below provider image-size constraints.

Dialogue requests remove the oldest historical visual attachment occurrences from
**this request only**, including source-entry visuals when necessary. Whole video
frame groups are removed together; the newest question's visuals are protected.
Text and speech transcripts remain, with a truthful omission marker. Files and
saved messages are not modified. No generated descriptions or text compaction.
Count, conservative encoded-body size and estimated context budget are checked;
context estimation includes 15% headroom and 16384 output/overhead tokens.
Oversized current attachments or text remaining over budget fail before paid media
processing. Provider validation remains authoritative for exact tokenization.

PlanGuard still owns access and the 500-credit start threshold. After resolving
media selection, executeResponse estimates all supplied text, retained images,
transcripts, pending one-time transcription and the actual configured output cap
(including reasoning). Admission assumes cache-write pricing, no guaranteed cache
hit, and 15% input/transcription headroom. SubscriptionUsageService checks fresh
legacy or V2 balances using existing plan/wallet/debt semantics. An authorized
cycle does not bypass this cost check, but the 500 start threshold is not imposed
a second time after earlier context steps have spent credits.

Insufficient balance returns the existing 496 / INSUFFICIENT_AI_CREDITS contract
with dynamic required/available amounts. WebSocket transports emit plan_error so
the existing purchase modal handles it. Admission precedes transcription and main
response generation; it does not undo earlier embedding/context-extraction costs.
It is an estimate, not an atomic funds reservation across concurrent requests.
Observed provider usage continues to drive billing, including actual cache rates.
No paid requests or purchases are performed by tests.

Video analysis uses sampled still frames and speech transcription, not continuous
motion or general sound recognition. Audio analysis uses a speech transcript.
Frames are sent to the chosen vision model; speech uses `gpt-4o-mini-transcribe`
once, then the transcript is included as text. All four current selectable chat
models use their existing provider adapters and cache policy.

The existing PlanGuard authorizes generation. Observed transcription tokens are
charged through `persistAiUsage` and the same legacy/V2/purchased-credit service,
with the generation's cycle ID and a per-asset operation. The normal response is
charged through the unchanged shared path. Returned total `credits` includes both;
optional `usage.mediaPreparationCredits` identifies the one-time preparation
portion. Main-model token counters remain main-model counters.

Estimates exclude generated response/reasoning and other context. They are not a
quote or reservation. Transcription is estimated at 30 credits/minute; observed
token usage determines the debit. Catalog exposes normal/cache-write input prices
and long-context multipliers. Prepared assets already marked ready have zero
additional transcription estimate.

## Storage, failures and deployment

Derived images and transcripts are encrypted using CryptoService in
`ai_media_assets`, checked by owner on every request. Original uploaded bytes are
temporary and removed after conversion. Unused prepared assets expire after 24h;
used assets remain available for dialog replay until deleted, including cascade
on user deletion. No public file URLs or client-provided image payloads enter the
provider request. Debug logs replace image base64 with hashes/lengths; text remains
subject to the existing private development logging policy.

An atomic prepared-to-transcribing claim prevents duplicate paid work. A successful
transcript is saved before billing. `billing_pending`, failed and interrupted
transcribing assets are blocked from automatic paid retries and require operator
reconciliation with token history. This version does not implement a recovery UI.
Missing provider usage is an error, not guessed billing. A provider-success/storage
failure can require manual reconciliation; do not blindly re-upload/retry it.

Apply migration `1790001000000-AddAiMediaAssets` before serving this code. Install
FFmpeg/FFprobe or configure `FFMPEG_PATH` and `FFPROBE_PATH`; Docker runtime includes
FFmpeg. Migration and production rollout have not been run by this change.

Validation: focused unit/provider tests, legacy/V2/purchased-credit integration
tests, TypeScript and ESLint; actual FFmpeg preparation checked with synthetic
photo/audio/video and invalid bytes. No paid live-provider media request yet.

### Media-only reflection instructions — 24 September 2026

A correlated media-only entry request contained one resolved image and provider usage reported `hasImages: true`, but its reflection addressed only metrics. The live shared instructions in `journal-response-instructions.ts` (consumed by `buildResponseSystemPromptParts` / `AiService.generateComment`) now explicitly treat images, video frames and transcripts as message content, including when text is empty. Media-only replies should identify supplied content, avoid inventing personal meaning, and ask a relevant clarification if intent is unclear. Text inside attachments remains source material rather than application instructions. Existing four-mode prompt contract tests pass (17 total); a real media-aware response is pending user retest. No billing, media conversion, socket or legacy-client contract changed on the backend.
