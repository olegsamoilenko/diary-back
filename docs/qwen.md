# Qwen3.8 Max

Qwen is an optional chat provider for entries, check-ins and their dialogs.
The default model remains GPT-5.6 Terra. Memory extraction and embeddings retain
their existing providers. Qwen configuration is loaded lazily on first use.

## Configuration

Set these secrets/configuration values on each backend host (never in the app):

    DASHSCOPE_API_KEY=<regional pay-as-you-go API key>
    QWEN_BASE_URL=https://<workspace-id>.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1
    QWEN_MODEL=qwen3.8-max

This implementation validates Singapore International and the exact model ID.
Use a Singapore API key and workspace endpoint together. Restart the backend
after environment changes. A production region has not yet been selected.

Qwen uses OpenAI-compatible Chat Completions with thinking disabled, bounded
completion tokens, JSON mode for short/full reflections, and usage-enabled SSE.
OpenAI-specific storage/cache options are not sent to Alibaba. Implicit cache
hits reported by the provider receive the cached-input credit rate. Completion
usage includes reasoning tokens if the provider returns them. Reasoning content
is never emitted to the app. Without usage, token counts are estimates, explicitly
marked as such, using the same Unicode-aware algorithm on frontend and backend.

## Pricing

Provider list prices verified on 2026-09-03. Product credits are separate from
the provider invoice: existing Nemory rates were retained during the Singapore
test switch, including frontend estimates and legacy COAST_TOKEN values.

| Per million tokens    | Singapore provider USD | Current Nemory credits |
| --------------------- | ---------------------: | ---------------------: |
| Standard input        |                   2.00 |                 16,500 |
| Implicit cached input |                   0.25 |                  2,060 |
| Output                |                   6.00 |                 49,510 |

Current Nemory Qwen credits were originally derived from Frankfurt Global
prices ($1.65/$0.206/$4.951); they do not represent Singapore provider cost at
10,000 credits/USD. No product pricing change or paid-provider activation was
performed during the region switch. Review the intended product pricing before
paid production use. This integration does not request explicit cache creation.
Provider token usage remains authoritative, regardless of available free quota.

## Database and rollout

Apply AddQwen38MaxAiModel1788436800000 before enabling Qwen requests on a host
that manages its schema with migrations. It adds qwen3.8-max to the token usage
history enum; user settings already store the model in a varchar column.
The migration was applied to the local development database and verified using
a temporary enum column on 2026-09-03. It must still be applied on other hosts.
The migration is idempotent. Its down operation intentionally retains the enum
value to preserve historical usage. The current Nest app also enables TypeORM
schema synchronization; no application startup was needed for the unit tests.

Deploy the backend before the updated frontend. The frontend offers Qwen as a
selection without changing existing selections. Validate a synthetic entry,
check-in, dialog and settings persistence before production rollout.

## Account access

The initial Frankfurt synthetic request returned HTTP 403 insufficient_quota.
The user subsequently confirmed Singapore qwen3.8-max free quota in the console.
On 2026-09-03, two synthetic Singapore API requests succeeded: JSON completion
and usage-enabled SSE, each reporting 48 input and 18 output tokens (132 total).
The streaming request returned its first content in approximately 0.8 seconds;
these tiny probes are not a production latency benchmark. No private entries
were sent and no Nemory user balance was charged by these direct diagnostics.
Full application/device validation and production deployment remain pending.

Region determines the access point and storage, while scope determines inference
locations. Frankfurt Global permits processing worldwide, including mainland
China; Singapore International excludes mainland China but is not EU-only.
Frankfurt EU scope restricts inference to the EU, but Qwen3.8-max documentation
currently lists Frankfurt Global only: verify model availability before promising
EU-only processing. Select a production scope deliberately for journal data.
No credentials or private entries are needed in a diagnostic report.

Sources:

- https://www.alibabacloud.com/help/en/model-studio/qwen3-8-max
- https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions
- https://www.alibabacloud.com/help/en/model-studio/new-free-quota

- https://www.alibabacloud.com/help/en/model-studio/regions
