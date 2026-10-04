# Qwen daily summary truncation — 2026-10-03

Read-only diagnosis of September 25 daily analysis after selecting Qwen.

- Trace: `54598bca-426a-4f9a-afd4-bf99039d5531`.
- Request snapshot: `.tmp/ai-requests/2026-10-03T09-35-32-167Z-entry-1bc57d94.json`.
- Model: `qwen3.8-max`; `max_completion_tokens: 2080`, `enable_thinking: true`, `thinking_budget: 1024`.
- Current Lite day visible guide: 800 tokens. Shared `tier_response` allowance adds 1024 reasoning and 256 format tokens for Qwen.
- Provider HTTP 200; completion ended with `finishReason: length`, inside an unclosed JSON text string. Provider reported input 11618, cached input 2048, output 2083; reasoning detail 1024. Do not reinterpret provider token details as an independently measured visible-text count.
- `PeriodicAnalysisService.generate` rejects length-limited results as `Incomplete analysis`; the client showed `ANALYSIS_RESULT_UNAVAILABLE`. Capsule generation is after this guard and was not reached.
- Same seed's entry and two dialogs completed successfully on Qwen. This was not a general Qwen connectivity failure.
- Shared `executeTextResponse` persists provider usage before the periodic result completeness check. Exact debit was not verified: local inspector unavailable and direct read-only DB connection returned EACCES. No refund or other data change performed.

No runtime or prompt changes; no provider replay. Next step: agree a larger technical output reserve separately from the approved visible-answer length guides, then update the shared output policy and focused tests. Also improve the user-facing truncation error without automatic paid retries. A larger reserve reduces risk but cannot guarantee completion; preserve incomplete-result protection.
