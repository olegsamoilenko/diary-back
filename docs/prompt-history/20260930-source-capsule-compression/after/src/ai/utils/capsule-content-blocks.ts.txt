/** Source capsules preserve evidence; durable profile memory remains a separate field. */
export const SOURCE_CAPSULE_BLOCKS = `SOURCE CAPSULE — MEANINGFUL BLOCKS:
Split the source into distinct situations/topics. Preserve each meaningful block separately,
in source order, as compact concrete sentences. Do not replace several events with one
generic theme such as "work anxiety and seeking balance". This is evidence for later analysis,
not a new analysis, a diagnosis, or a list of personality traits.
For each block retain what the source actually contains: essence, people and important facts,
actions, feelings/emotions and their stated triggers, consequences, decisions, promises and
unresolved questions. Omit absent categories instead of inventing them or adding empty labels.
Preserve the meaningful progression when present: situation, initial interpretation,
reaction, action, and outcome or uncertainty. Keep a mistaken first impression alongside
the later correction; retaining only the reassuring ending loses evidence for comparison.
Compress repeated framing before dropping these transitions or first-trial qualifications.
Keep numbers, times, deadlines, concrete proposed steps and useful conditions. Separate what
happened from what was planned, suggested, promised, cancelled or is still unknown.
Completing one checklist item or goal stage does not mean completing its parent task/goal.
Do not merge distinct meetings, people, days or recurrence occurrences. Remove repetition,
greetings and verbal padding; preserve the specifics that allow later comparison.
Keep the subject of each action explicit (questions are not slides). A retrospective
description of a dependency is not proof that it still exists. Keep later corrections,
decisions and the outcome of a dialog, not just its opening problem or proposed technique.
Example: "2026-09-07: Went bowling with Oleh, enjoyed the evening despite losing. Afterwards
met Iryna; discussed the presentation, felt tense after her question about the budget.
Promised to send her the figures on 2026-09-08; sending is not yet confirmed."
The example is illustrative, never source evidence.`;

/** Entry/check-in and response capsules compress wording, not the set of meanings. */
export const SOURCE_CAPSULE_COMPRESSION = `BLOCK-BY-BLOCK COMPRESSION:
For userDigest and assistantMemory, preserve EVERY distinct source meaning, not just the
main themes or highest-priority points. This specific rule replaces selection of
lower-priority details under length pressure for these two fields only.
First identify each event, action, thought, interpretation, doubt, feeling/emotion,
physical reaction, decision, promise, consequence and unresolved question actually stated.
Then compress each into short, concrete clauses; combine related clauses into blocks in
source order. Categories are a reading checklist, not mandatory headings or empty fields.
Keep who did/felt/thought what, about what, when, and any stated trigger or change.
Preserve contrasts, negation, intensity, mixed feelings, reasons, conditions and corrections
when they change the meaning. Do not infer a cause merely from the sequence of events.
Remove verbal padding, repeated context, rhetorical introductions and duplicate meanings.
Do not retell sentence by sentence, swap words for synonyms at the same length, or copy
whole passages. State repeated meaning once; retain any new nuance in its shortest form.
Use compact clauses and shared subjects, not vague labels such as 'felt various emotions'.
Do not add explanations or interpretations absent from the source. An explicitly reported
feeling or thought remains a user report; it is not an AI hypothesis or an objective fact.
Before returning, compare with the source: every distinct meaning must still be recoverable,
and every capsule claim must have a source. If the draft remains as long as a narrative
source, shorten its wording again, not its coverage. Already terse clauses may remain short;
never pad a brief source or delete meaning merely to achieve a compression percentage.
Illustrative wording only, never source evidence:
Source: 'I went to the workshop with a lot of excitement. When my first attempt failed,
I felt embarrassed and wanted to leave. I stayed, asked for help and finished the piece.
I was proud of finishing, but still disappointed with its uneven shape. I decided to
try again on Saturday, though I am not sure I will have time.'
Capsule: 'Workshop: excited initially; failed first attempt -> embarrassed, wanted to leave.
Stayed, asked for help, finished piece; proud of completion, disappointed with uneven shape.
Decided to retry Saturday; available time uncertain.'`;

export function capsuleSourceTime(sourceAt?: string, timezone?: string) {
  return `SOURCE TIMESTAMP: ${sourceAt || '(not supplied; do not invent)'}
SOURCE TIMEZONE: ${timezone || '(not supplied; do not invent)'}
SOURCE LOCAL TIME: ${sourceAt && timezone ? sourceLocalTime(sourceAt, timezone) : '(not supplied)'}
The local time above is computed by the application. Copy it when needed; never label
the UTC clock in an ISO timestamp ending in Z as local time. Source time and event time
are different: an event mentioned in this record may have happened earlier.
Retain this source date/time in the capsule. Resolve yesterday/tomorrow relative to this
source, never the server clock or extraction date. Keep an explicitly different event date
alongside the source date. If ambiguous, retain the wording and mark the date uncertain.`;
}

/** Display an instant without asking a model to convert UTC or epoch milliseconds. */
export function sourceLocalTime(
  instant: string | number,
  timezone: string,
): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(instant));
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value;
    return `${value('year')}-${value('month')}-${value('day')} ${value('hour')}:${value('minute')} ${timezone}`;
  } catch {
    return String(instant); // Unknown input stays unknown; never substitute server time.
  }
}

/** Compact the app's rendered check-in, preserving unrecognised/older-client text. */
export function sourceCapsuleInput(
  text: string,
  context?: Record<string, unknown>,
) {
  const compact = compactSourceContext(context);
  if (!compact || !Array.isArray(compact.answers))
    return { text, context: compact };
  if (
    !compact.answers.every(
      (a) => a && typeof a === 'object' && !Array.isArray(a),
    )
  )
    return { text, context: compact };
  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
  const answers = compact.answers as Array<Record<string, unknown>>;
  const supplied = answers.filter(
    (a) => typeof a.answer === 'string' && a.answer.trim(),
  );
  const rendered = normalize(text);
  if (
    !supplied.length ||
    !supplied.every(
      (a) =>
        typeof a.question === 'string' &&
        rendered.includes(
          normalize(`Question: ${a.question} Answer: ${String(a.answer)}`),
        ),
    )
  ) {
    return { text, context: compact };
  }
  // Q&A remains once in the original text; exact metadata stays in structured context.
  const { answers: _answers, extraNotes, ...rest } = compact;
  const bodyStart = text.search(/\n(?:Daily note:|Question:|Extra notes:)/);
  const header = bodyStart >= 0 ? text.slice(0, bodyStart) : '';
  const canCompactHeader =
    text.startsWith('Check-in template:') &&
    bodyStart >= 0 &&
    typeof compact.mood === 'string' &&
    header.includes(`Mood: ${compact.mood}`) &&
    (!header.includes('Metrics:') || !!compactSourceMetrics(compact.metrics));
  const headings = canCompactHeader
    ? text
        .slice(0, bodyStart)
        .split('\n')
        .filter((line) => /^Check-in (template|title):/.test(line))
        .join('\n')
    : '';
  return {
    text: canCompactHeader ? headings + text.slice(bodyStart) : text,
    context: {
      ...rest,
      ...(typeof extraNotes === 'string' &&
      extraNotes.trim() &&
      !rendered.includes(normalize(extraNotes))
        ? { extraNotes }
        : {}),
    },
  };
}

/** Accept older clients' metric arrays and the current compact prompt text. */
export function compactSourceMetrics(metrics: unknown): string {
  if (typeof metrics === 'string') return metrics.trim();
  if (!Array.isArray(metrics)) {
    // Preserve an older client's unknown shape rather than silently dropping evidence.
    return metrics && typeof metrics === 'object'
      ? JSON.stringify(metrics)
      : '';
  }
  return metrics
    .flatMap((metric: unknown) => {
      if (!metric || typeof metric !== 'object') return [];
      const m = metric as Record<string, unknown>;
      if (
        typeof m.name !== 'string' ||
        typeof m.value !== 'number' ||
        !Number.isFinite(m.value)
      )
        return [];
      const scale = Array.isArray(m.scale) ? m.scale : [1, 5];
      const endpoints =
        (typeof m.id !== 'string' || m.id.startsWith('custom:')) &&
        (m.lowLabel || m.highLabel)
          ? ` (${scale[0]}: ${typeof m.lowLabel === 'string' ? m.lowLabel : 'unspecified'}; ${scale[1]}: ${typeof m.highLabel === 'string' ? m.highLabel : 'unspecified'})`
          : '';
      return [`${m.name}: ${m.value}/${scale[1]}${endpoints}`];
    })
    .join('; ');
}

export function compactSourceContext(
  context?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!context) return undefined;
  const { metrics, ...rest } = context;
  const compactMetrics = compactSourceMetrics(metrics);
  return { ...rest, ...(compactMetrics ? { metrics: compactMetrics } : {}) };
}

/** Preserve supplied measurements exactly, even if extraction omits a numeric detail. */
export function withSourceObservation(
  text: string,
  source: {
    sourceAt?: string;
    timezone?: string;
    structuredContext?: Record<string, unknown>;
  },
) {
  const context = source.structuredContext;
  const metrics = compactSourceMetrics(context?.metrics);
  const observation = [
    ...(source.sourceAt ? [`Source timestamp: ${source.sourceAt}`] : []),
    ...(source.timezone ? [`Timezone: ${source.timezone}`] : []),
    ...(typeof context?.mood === 'string' && context.mood
      ? [`Mood: ${context.mood}`]
      : []),
    ...(metrics ? [`Metrics: ${metrics}`] : []),
  ];
  if (!observation.length) return text;
  return `[SOURCE_OBSERVATION]\nState at this entry/check-in, not a daily aggregate.\n${observation.join('\n')}\n[/SOURCE_OBSERVATION]\n${text}`;
}
