# Capsule fidelity and actual consumers — 29 September 2026

## Scope and evidence

Read-only review of the September 7–13 synthetic life scenario: 12 entry reflections and 15 dialog exchanges (10 entry dialogs, 5 check-in dialogs), filtered by trace IDs in the current backend usage history. Compared original messages/responses with generated memory and dialog summaries, later provider requests, and the saved September 13 daily-analysis prompt. No paid generation or application behavior changes.

Evidence: backend `.tmp/nemory-user-review-2026-09-{25,26,29}-*.jsonl`, frontend/backend context audit logs, `.tmp/token-usage-db-audit-20260929.json`. Reproducible extraction: `.tmp/capsule-quality-inspect.cjs`; private/local evidence output `.tmp/capsule-quality-evidence-20260929.json`.

Coverage qualification: entry reflection memory was available for all 12 entries. Later history exposed 10 generated entry digests and one original-text fallback; the final entry's user digest was not independently visible in later entry-history requests. Do not count its absence from those logs as a failed capsule generation.

## Main conclusion

The user's desired contract is a compact entry, a summary of its AI response, and short question/answer summaries for each dialog. Current consumers do not implement that contract consistently. They use entry userDigest plus selected assistantMemory, and dialog user.text plus assistantMemory. Generated dialog assistant.text exists but is omitted from these historical/periodic context paths. This is a consumer/contract mismatch, not solely a model summarization problem.

Current daily analysis also uses original entry text, not exclusively entry digests. This was verified directly in September 13's saved prompt: all four original entries appear with text lengths117/157/141/207, plus reflection memory and the final entry's dialog memory. Do not claim all source text is already replaced with capsules.

## Verified implementation

- `src/ai/ai.service.ts` extractAssistantMemoryCapsuleV2 explicitly asks for durable conclusions and strategies, NOT a summary of the whole response.
- The dialog extractor generates assistant.text (up to700 characters) and separate assistantMemory (up to4 items). Its prompt describes text as continuation support.
- Frontend `utils/memory-search-v2/capsuleRowToCandidate.ts:dialogsForPrompt` sends turn.user.text and turn.assistant.assistantMemory; omits assistant.text.
- `utils/memory-capsules-v2/buildStoredMemoryCapsulePromptV2.ts` renders those separate dated source/memory fields.
- `utils/periodic-analysis/context.ts:analysisDialogPairs` uses capsule.text for the user; for assistant uses assistantMemory or full original reply when memory is empty. It never chooses assistant capsule.text. Thus absence of durable memory can inflate context despite an available concise answer summary.
- `utils/periodic-analysis/snapshot.ts:memoryFor` uses entry assistantMemory; visible entry bodies remain original text.
- Current `utils/diary/db/handleAssistantDialog.ts` calls `buildDialogsPrompt`, which preserves full completed history. Do not assume the extractor's claimed old-turn summary consumer is active here.

## Findings

### F1 — Concrete completion-status error in an entry digest

September9 original distinguishes the last checklist item at11:20 and closing the task at15:00. Digest calls11:20 completion of the task, while also retaining15:00 task completion. This conflates a step with the parent task and introduces contradictory completion times. Preserve action target, state, and time together.

### F2 — A useful action disappears during entry compression

The same entry says the user wanted to seek reassurance and stopped before sending the message. Its user digest retains rumination but omits the stopped action. Reflection memory preserves the idea as a strategy, which is not equivalent to evidence the user already applied it. Future progress analysis needs that factual distinction.

### F3 — Reflection memory often drops situational advice

September7 response proposes a bounded chat check and a specific departure time; memory retains broad boundaries but drops these concrete examples. September12 screen-pause response proposes anchoring the pause after dinner/before the series if the user wants to continue; memory retains trial/awareness themes but drops that implementation suggestion. This fits the current durable-memory prompt but is incomplete as a response summary.

### F4 — Actual useful dialog summary is not sent to daily analysis

September13 final dialog assistant.text preserves five full walks, one shorter walk, one missed day, expenses, picnic/screen trial and recovery after Friday. The actual day-analysis dialog block includes only two assistantMemory items: fact-based review and return without compensatory doubling. Other day/planner context may independently contain some facts, so this does not prove the entire day prompt lacks them; it proves the dialog's answer summary is not the field being consumed.

### F5 — Epistemic status can harden

September11 reflection memory states that explaining fatigue helped avoid transferring it onto the relationship. The user reported explaining fatigue, not a measured relationship outcome. The original AI reply already asserts reduced tension; extraction carries that interpretation as an accomplished benefit. This is propagation of an overconfident source response, not necessarily a new extractor invention. Prefer attribution such as Nemory suggested/explained and retain uncertainty; do not turn interpretation into user-confirmed evidence.

September10 memory provides a positive counterexample: it preserves a possible tendency as probable rather than established fact.

### F6 — Compression frequently expands short source messages

Counts below are characters with whitespace normalized, not token counts:

| Compared material | N | Original | Summary | Result |
|---|---:|---:|---:|---|
| Generated entry user digests with later evidence |10|3084|2795|9.4% total reduction;8/10 individual digests longer|
| Dialog user messages |15|1981|2245|13.3% expansion;14/15 longer|
| Dialog AI answers |15|9758|4149|57.5% reduction|

Expansion is partly neutral third-person rewriting and explicit dates; dates can improve fidelity. Nevertheless, short original messages often need no paid paraphrase. Preserve the short source or require no unnecessary expansion, without enforcing a ratio that deletes crucial facts.

### F7 — Repeated advice can crowd out new evidence

Return without doubling, partial progress counts, and calm without productivity pressure recur across multiple reflection/dialog memories. They are legitimate per-source records, but at assembly time repeated AI advice should not be interpreted as multiple independent user observations. Preserve source links, actual new applications, and outcomes while collapsing repeated wording.

### F8 — Dialog summaries are generally useful but inherit response limitations

Reviewed question summaries preserve dependencies, deadlines, negations, plans versus completed work, and user clarifications reasonably well. Good examples: data expected by11:00, six-ready/two-pending slides, and keeping questions in notes rather than slides. Answer summaries often retain concrete workflows: fact/impact/action, a maximum of three list items, and returning to normal walking duration. No broad evidence of unusable or unrelated summaries in these15 exchanges.

However, faithfully summarizing a questionable source recommendation does not validate it. Source-response quality and compression fidelity must be evaluated separately. Short summaries can also omit relevant details: the final dialog summary calls the picnic prepared while the full response describes it having occurred; use event phase explicitly where relevant.

## Recommended contract (proposal only)

- Entry summary: events, reactions, actions, results and unresolved intentions, retaining entity/occurrence identity, important quantities, negations and time.
- AI response summary: what Nemory concluded (attributed/qualified), what it suggested, conditions/limits, and unanswered questions; not merely generalized durable rules.
- Dialog question summary: actual user question, correction, decision or outcome; retain short originals when adequate.
- Dialog answer summary: conclusion/explanation plus actionable recommendation and its conditions. Existing assistant.text is the first reuse candidate; no duplicate storage by default.
- Keep durable memory distinct where useful, but do not automatically append both summary and memory with repeated content to every analysis.
- Validate generated content and the exact consumed prompt separately. Test stage-versus-task completion, intended-versus-completed events, rejected/conditional advice, clarified facts, empty assistantMemory with valid text summary, and repeated advice versus new evidence.

No prompt, schema, context consumer, limits or paid data have been changed. Next step is agreement on this contract, then focused shared-consumer changes with compatibility for existing capsules and clients.
