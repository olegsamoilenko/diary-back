# September 7 fresh seed audit — September 29, 2026

Follow-up implementation after this audit: user approved target900/accepted1000 and one percentage-based rewrite of oversized capsules. That mechanism now retains the first completed capsule on retry failure and uses existing context-audit/console comparison logging. See `capsule-blocks-20260929.md`. The historical run findings below remain unchanged; this report does not claim a new paid generation or repair of its stored result.

Run window: 19:25:22–19:31:05 UTC. Read existing frontend/backend diagnostic files and localhost usage history in a READ ONLY transaction. No paid calls, seed reruns, database mutations or device actions were performed by the assistant.

## Result

15 of 16 scenario steps completed. The day report was saved locally with status completed, a nonempty answer, capsuleGeneration.status failed and an empty capsule. The runner correctly surfaced failure on the final step instead of claiming complete success.

Luna generated 1362 capsule-text tokens against the configured maximum 900. Provider finishReason was stop, so this was a complete answer exceeding the application budget, not transport failure or truncated JSON. The generated text is present in capsule.day.extracted immediately before capsule.day.failed; it is absent from the saved report capsule. The auxiliary call cost 33 credits. The main daily analysis remains saved.

The current loss-on-overbudget behavior needs a product correction: preserve the received capsule on the device, mark overbudget, and treat compression/context admission separately. Discussed, not implemented. Latest user proposal: target900, accept up to1000; if >1000, compress only the generated capsule toward900, accept up to1000. Assistant recommends one bounded retry and retaining the original on failure. No generation limit or retry policy changed or paid retry executed in this audit.

## Context and content

- First entry history: only the same-day original morning check-in. Anxiety check-in history: that morning plus the entry and its two completed dialogue capsules. Source IDs were unique in both prompts; no evening/future-source leakage observed.
- Daily snapshot has four distinct sources: morning, journal entry, anxiety check-in, evening. All four dialogue pairs are present; one goal, habit, task, event and reminder plus the walking action are represented. previousAnalyses is empty, as expected for a fresh first day.
- Luna receives the exact 15623-character source payload used by the main daily model, plus its attributed answer and separate compression instructions.
- Morning/evening have no independent user-facing AI answer or Luna capsule extraction. Their original questions/answers, mood and measurements appear in daily context.
- Structured timestamps are correct, but generated source capsules mislabel 12:10Z as 12:10 Europe/Kiev instead of 15:10, and 13:40Z as 13:40 instead of 16:40. The rejected daily capsule similarly reports entry dialogues at 12:16–12:27 rather than 15:16–15:27. This date-formatting/model-grounding issue remains unresolved.
- The entry capsule incorrectly describes intermediate ratings using endpoint labels (e.g. energy 3/5 as almost no energy). Its generated prose repeats metadata already prepended by code. The full structured metric array then duplicates the compact retrieval header. Fix below addresses newly generated metadata and prompt assembly, not historical erroneous prose.
- Source facts/actions are substantially retained in entry/check-in capsules. Assistant interpretations are generally attributed; dialogue retrieval still consumes assistantMemory rather than the separate richer assistant.text summary. Thus some detailed response wording is absent from later context. No change to that contract in this audit.
- The daily answer is 1986 characters and covers work, uncertainty, boundaries, the walk and the uncompleted call. It overstates a one-day observation as a confirmed pattern and implies the walk caused the measured stress decrease. These should remain hypotheses; two measurements establish change, not its cause. Response-quality prompts were not changed here.
- Check-in backend events lack a shared traceId, and no standalone checkin user-review file was produced, although full request/response/extraction evidence is present in context-audit. Diagnostic correlation remains incomplete.

## Actual usage

Verified against token_usage_history for this run, including embeddings. Output counts include provider reasoning; cached input is a subset of input.

| Operation | Calls | Input | Cache read | Output | Credits |
|---|---:|---:|---:|---:|---:|
| Entry answer | 1 | 4503 | 0 | 1512 | 182 |
| Entry dialogues | 2 | 11359 | 8192 | 1055 | 148 |
| Check-in answer | 1 | 6235 | 2048 | 1248 | 164 |
| Check-in dialogues | 2 | 13541 | 11392 | 791 | 121 |
| Daily answer | 1 | 7993 | 0 | 1775 | 267 |
| Entry/check-in source capsules | 2 | 4030 | 0 | 1800 | 33 |
| Entry/check-in answer capsules | 2 | 6798 | 0 | 1877 | 38 |
| Dialogue capsules | 4 | 10947 | 6516 | 2216 | 41 |
| Rejected daily capsule | 1 | 6654 | 0 | 1563 | 33 |
| Embeddings | 6 | 1653 | 0 | 0 | 6 |
| Total | 22 | 73713 | 28148 | 13837 | 1033 |

Cache-write input: 2172, included in input. Fresh standard input excluding cache read/write: 43393. The first-entry local Qwen estimate was 6223, actual input 4503; do not treat estimated section counts as provider-token measurements. Daily report aggregates both calls: input14647/output3338/credits300, not one main-model request.

## Metric correction after user feedback

Reused the live renderAnalysisMetrics formatter from entryResponseContext: compact strings for daily snapshot and source-extraction requests. Custom scales preserve endpoint meanings. Backend accepts previous client arrays and formats them compactly. It attaches a deterministic dated observation header and instructs Luna not to repeat or interpret its numeric metadata. Retrieval omits that attached header when the existing persisted source fields already represent its evidence; older JSON headers are supported, missing/mismatched evidence remains intact. No storage schema, log transport, saved report, billing or model limit changes.

Files: front utils/periodic-analysis/snapshot.ts, memory-capsules-v2/prepareMemoryCapsuleV2.ts, memory-search-v2/runMemorySemanticSearchShadowV2.ts, memory-capsules-v2/buildStoredMemoryCapsulePromptV2.ts; back ai.service.ts and utils/capsule-content-blocks.ts. Focused tests: 31 frontend and 3 backend passed. TypeScript, scoped ESLint and diff-check passed in both repositories (final backend lint after narrowing malformed metadata values). No real generation validating the new extraction instruction has been performed. Existing seed content was not rewritten.

Evidence stays in the existing .tmp/context-audit-2026-09-29.jsonl, nemory-ai-full, ai-requests and frontend daily_scenario logs. Do not rerun the entire seed to repair only its missing daily capsule; that would duplicate data and paid work.
