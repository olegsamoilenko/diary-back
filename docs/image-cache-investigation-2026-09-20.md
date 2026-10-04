# Terra image prefix cache investigation — 20 September 2026

Scope: explain why the unchanged text prefix was not reused between an image entry and its first dialogue. No application prompts, provider adapters, billing or persisted user data were changed.

## Result

Real API calls reproduced the failure with **synthetic text and a synthetic 512x512 PNG**, using the message roles, content-block shapes, approximate text token lengths and cache markers of the failing application requests.

For this tested scenario, Chat Completions did not preserve the explicit text-prefix boundary when an image was present. Responses preserved it and returned `cache_hit`. This localizes an endpoint-dependent behavior; it does not establish OpenAI's internal cause or a universal limitation for every model/image.

| Endpoint / condition | Reported cache read | Reported cache write |
| --- | ---: | ---: |
| Chat, text-only baseline | 0 | 2509 |
| Chat, identical text-only repeat | 2509 | 0 |
| Chat, text-only JSON -> plain setting | 2509 | 0 |
| Chat, application-shaped image baseline | 0 | absent |
| Chat, identical image baseline repeat | 3328 | absent |
| Chat, change only task AFTER last explicit marker | 0 | absent |
| Chat, change only source text AFTER last explicit marker | 0 | absent |
| Responses, application-shaped image baseline | 0 | 2475 |
| Responses, change only task AFTER last explicit marker | 2475 | 0 |

Responses comparison diagnostics: `{"type":"cache_hit"}`.

The isolated image-only single-system-message control also reused 2304 tokens on an exact repeat and after removing JSON response format. Thus neither image presence nor a JSON/plain switch alone explains every miss. The failing combination involves the application-shaped messages and the Chat Completions image path.

The final explicit marker in the application-shaped test is at approximately 2475 text tokens. Chat's exact-repeat read of 3328 exceeds that boundary. Absent `cache_write_tokens` is NOT a reported zero and must not be used to infer actual provider cache-write charges.

## Correlation evidence

All API payloads used `gpt-5.6-terra`, `service_tier: default`, `store: false`, medium reasoning, explicit prompt cache mode and streaming. Test output cap was 256. Text and image bytes before the boundary stayed identical within each comparison. No retries were enabled.

Chat warmed baseline: `req_696eef8e6b624b76b71215d4f9df4853`.

Chat task-only change, cache read 0: `req_9077a34277054e2889c9646d7fc91168`.

Responses baseline: `req_0381568cd2bb48f3b71eb7131e258a89`, response `resp_057e3fe5fd48de1e016ab03dd5f11c87d29f330fbf21b0bfab`.

Responses task-only change, cache read 2475: `req_0c1fb887245343dc9f8fdec6512e8d2e`, response `resp_07e83efd86d6fd00016ab03de1215887d2b846353dbb9e7cda`.

Raw results: `.tmp/image-prefix-probe-{runId}.jsonl`, runs:

- `e41a3c04-0253-4af2-ae2b-505a149d1967`
- `983bbd46-0e99-48e9-9737-269d075b52ac`
- `1032c591-bce2-45e1-bba2-c74e9e6be051`
- `1032c591-bce2-45e1-bba2-c74e9e6be051-isolate`
- `8aacfdb1-e67b-4919-8f81-d420b6e69e23-responses`

18 successful calls: 55,981 input, 29,125 cache-read, 4,984 reported cache-write, 279 output tokens. At documented Terra Standard rates, the API-equivalent estimate from reported usage is $0.065377. Thirteen calls omit cache-write counters; this estimate is not an invoice reconciliation. App user credits were not debited by the isolated probe.

The initially proposed replay of actual journal text was rejected by automatic approval review before execution. The successful replacement sanitized EVERY text block before transmission and used only a generated test image; no original journal text/image was sent in these diagnostic probes.

## Reproduction and next step

### Assistant boundary growth correction (latest)

Actual app test 20:43/20:44UTC: initial write2475, both dialogs read2475/write0.
The JSON marker did move, but was on assistant output_text, which did not create
cache boundaries. Controlled relocation to a following nonempty input_text
produced explicit growth; an empty input_text marker did not produce reliable
explicit writes and was rejected as a solution.

Production converter now removes unsupported output_text markers and advances
them to the next existing nonempty input message. Prompt text, roles, message order
and media bytes remain unchanged. First dialog boundary includes existing task
instructions; subsequent boundaries also include the current question (cache-write
pricing now applies to it). No extra separator or duplicated content is inserted.

Live production-converter sequence d549510e-175f-4e62-915e-8fedf1e3538c:

| Request | Input | Read | Write | Output |
|---|---:|---:|---:|---:|
| Entry | 3632 | 0 | 2475 | 25 |
| Dialog 1 | 3621 | 2475 | 1096 | 23 |
| Dialog 2 | 3646 | 3571 | 72 | 26 |
| Dialog 3 | 3679 | 3643 | 33 | 24 |
| Dialog 4 | 3712 | 3676 | 33 | 23 |

Each dialog returned cache_hit diagnostics. Marker rotation (retaining only two
latest completed assistant boundaries) still reused the prior endpoint. The
synthetic fixture includes source image; source is cached from the first dialog,
not initial entry, because the initial approved boundary is still common context.
Source ordering/time normalization from initial entry to first dialog is separate.
Test flags: --shape-only --responses --app-adapter --input-boundaries
--nonempty-boundary --growth-series --run. Earlier results below are historical.

### Subsequent approved image transport implementation

The user approved Responses only when resolved images are present, retaining text
Chat Completions for comparison. This is implemented inside the existing provider
adapter and shared billing lifecycle; no separate image prompt/billing mechanism.
Qwen/Anthropic are unchanged. `--shape-only --responses --app-adapter` now reuses
the production request converter and runs synthetic entry/dialog/repeat (dry run
unless --run). Historical assistant blocks must use output_text, not input_text:
the first live check caught a 400 for that mismatch before it was corrected.

Successful corrected run: `.tmp/image-prefix-probe-00918fbd-0cec-4157-82f1-7e759eba7ca3-responses.jsonl`.

| Call | Input | Cache write | Cache read | Output | Elapsed |
|---|---:|---:|---:|---:|---:|
| Entry | 3632 | 2475 | 0 | 12 | 1937 ms |
| First dialog | 3621 | 0 | 2475 | 25 | 1010 ms |
| Identical dialog repeat | 3621 | 0 | 2475 | 28 | 1797 ms |

The failed preliminary sequence had one successful entry (3631 input, 2475 write,
23 output), then a rejected dialog. Total reported successful usage in this change:
14505 input = 4605 ordinary + 4950 write + 4950 read; 88 output, including reasoning.
API-equivalent reported-usage estimate: USD 0.023631, excluding any unreported usage
for the 400 rejection. These calls do not write the app DB or charge Nemory users.
This validates the converter and common prefix. No cache growth beyond 2475 or
universal latency advantage is established; real app validation remains user-led.

The recommendation below describes the earlier investigation, before approval.

`scripts/probe-image-prefix-cache.cjs` defaults to a free dry run. `--run` makes paid requests. `--image-only` isolates a fresh image prefix; `--shape-only` uses only structure/token lengths from local fixture logs and replaces all content. `--shape-only --responses` runs the two-call diagnostic comparison. The shape modes require the two named local request logs. `--isolate --run-id=...` compares changes against an existing synthetic baseline; do not reuse a completed output filename.

Recommended next implementation discussion: use one shared OpenAI Responses adapter beneath the existing `executeResponse` lifecycle, preserving access checks, legacy/V2 plans, wallets, stream/cancel contracts and usage recording for all relevant OpenAI consumers. Do not introduce an image-only parallel billing/prompt pipeline. No migration is implemented by this investigation.

Separate known issue: current initial source/photo follows the last explicit marker and task instructions precede it; the dialogue reconstructs a different source time suffix. These source-history/order issues remain unchanged and must be addressed separately if caching source media from the first entry is desired.

Official references:

- https://developers.openai.com/api/docs/guides/prompt-caching
- https://developers.openai.com/api/docs/guides/prompt-caching/diagnostics
- https://developers.openai.com/api/docs/guides/images-vision
