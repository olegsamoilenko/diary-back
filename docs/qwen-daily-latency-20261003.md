# Daily Qwen latency — 2026-10-03

Read-only diagnosis; no runtime changes, paid replay, or restarts. User reported about 50 seconds on the generating-answer loader versus about 25 previously.

Latest September 26 trace: bce7572f-066d-4ae3-a82a-a6ad444d7334.

| Measurement | Sep26 run Oct2 | Sep25 retry Oct3 | Sep26 run Oct3 |
| --- | ---: | ---: | ---: |
| Qwen first content delta (seconds) | 22.959 | 27.728 | 30.400 |
| Qwen completion (seconds) | 48.852 | 57.885 | 63.699 |
| Input tokens | 15243 | 11618 | 11864 |
| Cached input | 2048 | 0 | 2048 |
| Output incl reasoning | 1960 | 2180 | 2299 |
| Reported reasoning tokens | 852 | 964 | 947 |

Final SDK payloads all use qwen3.8-max, stream=true, enable_thinking=true and thinking_budget=1024. Older Oct2 max_completion_tokens=2480; latest payload has no output cap under the approved partial-output policy. Recent minimal accuracy edit adds 39 o200k tokens. No evidence that its added size explains a doubling. Prompt/content effects and provider queue/prefill/reasoning latency cannot be independently identified from these observations; longer output is observed, but no causal per-factor timing claim is established.

Additional preparation: latest day26 request first recovers the day25 capsule through Luna (child trace94b4b33b-5921-4b6a-9431-ae62e1b16b00). Provider request15:44:15.253Z, duration11.744s, frontend recovery receipt15:44:27.386Z. Main request sent15:44:28.446Z, Qwen starts15:44:29.187Z, first content at15:44:59.587Z. Thus at least44.3s from the recovery provider start to first Qwen content, plus earlier local preparation. Frontend first rendered text timestamp is not logged here, so exact phone wait cannot be certified.

Historical seed boundary explains the extra recovery: manually generated day25 has asOf2026-10-03T14:59:26.645Z, while day26 seed request uses asOf2026-09-26T19:00:00Z. capsuleRecovery.ts filters report asOf<=request.asOf, so that manual report is outside the seed's historical cutoff. Source-only recovery is therefore used. Do not silently remove the temporal guard or modify test data.

The shared loader retains its initial startedAt across context/generation stages (useAiPreparationLabel.ts and PreparationElapsedTime in AILoaderConcepts). The number next to the generating label includes preparation. It is not the isolated duration of that stage. About50s on this counter is consistent with the measured recovery+Qwen wait; actual Qwen first content increased about7.4s against the Oct2 day26 run, not25s.

Main response forwarding remains streaming: gateway onText -> periodic_analysis_chunk -> requestAnalysisStream onChunk -> PeriodicAnalysisContent.push. No intentional whole-answer buffering found in this path. First provider content may include JSON opening syntax rather than the first rendered character.

Next if needed: measure frontend first received/rendered text and capture loader start for exact phone timing, and align historical debug summary asOf with seed expectations if user authorizes. No prompt changes needed solely from this latency evidence. No AI API usage incurred; coding-agent token counters unavailable.
