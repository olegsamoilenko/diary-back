/** Shared by initial capsule creation and the existing action extraction after follow-ups. */
export const PERIOD_BRIEF_MEMORY_INSTRUCTIONS = `Also return briefMemory: a compact 50–100 token memory (not words) of the meaningful Nemory discussion.
Use short clauses in the source language; less than 50 tokens is correct for sparse material; aim below 100.
Keep only the main explanation/hypothesis, specific useful recommendation, and any user correction,
decision or confirmed result. Attribute hypotheses and suggestions to Nemory, not to the user.
Prioritize user corrections and actual outcomes over older interpretations. Unknown outcome is not failure.
Do not retell the day's events, list topics, repeat praise, metrics, generic support or all dialogue turns.
This is a replacement of the prior brief, not an appended transcript; merge repetitions and supersede
refuted explanations. Preserve an unresolved distinction rather than inventing a conclusion.
Use an empty string only when there is nothing meaningful to retain.`;

export function readPeriodBriefMemory(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const brief = (value as Record<string, unknown>).briefMemory;
  // Do not cut clauses or drop the main capsule when a model misses the soft target.
  return typeof brief === 'string' ? brief.trim() : undefined;
}
