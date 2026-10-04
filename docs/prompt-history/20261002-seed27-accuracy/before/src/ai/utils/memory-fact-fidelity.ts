/** Also used during the second compression pass, which sees only capsule prose. */
export const CAPSULE_FACT_PRECISION = `FACTS THAT MUST SURVIVE COMPRESSION:
Retain the exact subject and scope of completion: one checklist item or goal stage is not
the whole task/goal. Keep partial versus full progress, targets versus achieved values,
minimum versus maximum, and plans versus confirmed actions. A target above today's result
does not mean it has never been reached or that the user is gradually building up to it.
Keep source/measurement time, event time, duration, availability window and deadline distinct.
Do not calculate an exact event interval from a message timestamp and a stated duration
unless the source explicitly ties them together. 'Working until 09:30' is not 'will finish
by 09:30'. Do not add precision, a new promise or a progress stage while shortening.
Preserve explicit self-reports of feelings, motives or what helped as the user's account;
do not relabel them unconfirmed AI claims. They do not independently establish a broader
psychological cause. Keep a reduced urge separate from confirmed non-action.
Before returning, compare each status, number, time and claim of confirmation with its
source wording. Shorten phrasing, never the qualifiers that determine what actually happened.`;

/** Shared by memory extraction and period capsules, not user-facing response tasks. */
export const MEMORY_FACT_FIDELITY = `MEMORY FACT FIDELITY:
Preserve who reported each claim and its status: confirmed user action, user intention,
Nemory suggestion, or tentative interpretation. A suggestion is not an accepted plan;
an accepted plan is not completion. Preserve useful suggestions as suggestions, without
claiming that the user tried them or that they worked.
Check factual claims against the supplied original user data. An assistant response or
previous capsule is not independent evidence; do not copy its unsupported certainty into
memory. Attribute assistant-only interpretations to Nemory and retain their uncertainty.
Repetition of an interpretation in later responses/capsules is not new corroboration.
Do not credit an AI suggestion for an action the user reported before receiving that advice.
Preserve the distinction between feeling an impulse and acting on it, and between a first
trial and an established habit. A later improvement alone does not prove its cause.
Psychological hypotheses and possible connections are useful memory: preserve their
substance, supporting observations and reasoning as Nemory's hypotheses, even when not yet confirmed. Do not
discard a useful explanation simply because it is tentative. Invented event details,
times and actions are different from interpretations and must not become source facts.
Keep event dates separate from the date of writing. Resolve relative dates only when the
source date and timezone make them unambiguous; otherwise preserve the relative wording
and uncertainty. Later explicit user corrections supersede earlier plans about the same event.
Count only distinct confirmed occurrences. One completed night plus an intention for the
next night is one confirmed night and one plan, never two completed nights or a streak.
Before returning memory, verify dates, counts, action status and claimed outcomes against
their sources. Omit an unsupported detail rather than inventing a correction. Under the
length limit, drop lower-priority details instead of removing qualifiers that change meaning.
${CAPSULE_FACT_PRECISION}`;

/** Used by current and compatible legacy source extraction, not dialogue summaries. */
export const DURABLE_USER_MEMORY_SELECTION = `DURABLE MEMORY SELECTION:
userDigest already retains the episode. Add userMemory only for explicitly supported
enduring circumstances, preferences, longer-term goals, or explicitly repeated behavior.
A significant current difficulty may qualify when the source supports ongoing relevance;
do not turn every temporary feeling into vulnerability. A pending checklist, an unknown
future result, a first experiment or its isolated outcome belongs in userDigest, not a
durable trait. Reclassifying it as fact does not make it durable. When evidence of lasting
relevance is absent, return no userMemory item. Apply the same criteria to problems: those
items also become durable vulnerability memory, not a separate list of temporary concerns.
Empty problems and userMemory arrays are valid results.`;
