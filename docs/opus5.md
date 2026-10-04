# Claude Opus 5 in Nemory

The app model menu now offers GPT-5.6 Terra, Qwen3.8 Max, and Claude Opus 5.
The default remains Terra. Previously saved Claude preferences normalize to
Opus 5 in the new frontend; saved GPT-5.4 preferences normalize to Terra.
Backend model identifiers, registry entries, historical prices and database
values are retained so older apps and usage history remain supported.

## Provider configuration and requests

Opus 5 uses the existing server-only ANTHROPIC_API_KEY and the native Anthropic
Messages API, with model claude-opus-5. No new credentials are needed.
Existing entry/check-in short/full reflections and streaming dialogs share the
Claude integration. Both non-streaming and streaming requests explicitly set
thinking.type to disabled for Opus 5 only. This preserves the old non-thinking
behavior and 2,500-output-token cap; Opus 5 otherwise enables adaptive thinking
by default, potentially consuming the output budget before producing text.
No sampling parameters or automatic model fallbacks are added. Existing Claude
request options remain unchanged. Text parsing ignores non-text content blocks.

## Pricing and usage

Official standard API prices verified 2026-09-03 are unchanged from Opus 4.7:
USD5 input, USD25 output, USD0.50 cache reads and USD6.25 five-minute cache writes
per million tokens. Nemory uses 50,000 / 250,000 / 5,000 / 62,500 credits,
respectively. Frontend estimates match the new backend rate entry. Other model
rates are unchanged. Provider usage is authoritative, including separate input,
cache reads, cache writes, and output counts. Equal token prices do not guarantee
equal request cost because output length and model behavior may differ.

## Database and rollout

AddClaudeOpus5AiModel1788441000000 adds claude-opus-5 to the existing usage enum.
Only this additive migration was run on the verified local database on 2026-09-03.
All previous enum values were preserved; a temporary-table insert was verified.
Rollback retains the enum value to preserve history. Apply the migration on other
hosts before enabling Opus 5, and deploy the backend before the new frontend.
No production deployment, broad migration run or dependency upgrade was done.

## Live verification

Two synthetic calls through AiService's real Claude generation methods succeeded
with the configured API key on 2026-09-03: JSON short/full reflection and SSE.
They reported 109 input / 126 output and 109 input / 133 output tokens. Both ended
with end_turn, reported authoritative usage, and returned valid reflection JSON.
No private journal data was sent or application balance charged by these probes.
These small probes verify integration, not comparative reflection quality.
Verification: 44 backend tests and 27 frontend tests passed, including legacy
Claude request compatibility and cached billing. Both TypeScript checks passed.
Application/device validation remains the next step.

Sources:

- https://platform.claude.com/docs/en/models/opus-5/overview
- https://platform.claude.com/docs/en/models/opus-5/migration-guide
- https://platform.claude.com/docs/en/about-claude/model-deprecations
