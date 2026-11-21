import { randomUUID } from 'crypto';

/** Buffer an initial control until it can be bound to a receipt. Model prose
 * streams verbatim and the device renders the confirmed result separately. */
export function plannerReviewStream(send: (chunk: string) => void) {
  let held = '';
  let passthrough = false;
  const marker = '[[NEMORY_CHANGE:';
  return {
    push(this: void, chunk: string) {
      if (passthrough) return send(chunk);
      held += chunk;
      const start = held.trimStart();
      if (marker.startsWith(start) || start.startsWith(marker)) return;
      passthrough = true;
      send(held);
      held = '';
    },
    finish(boundChange: boolean) {
      if (held)
        send(
          boundChange
            ? held.replace(/^\s*\[\[NEMORY_CHANGE:[^\r\n]{1,2048}?\]\]\s*/, '')
            : held,
        );
      held = '';
    },
  };
}

// The marker routes the reply to Luna. Its payload is never an action or an ID.
// Only the finalized answer gets a receipt key; stream playback cannot apply it.
export function bindPlannerReview(
  raw: string,
  response: { format: 'text' | 'json'; textField?: string },
): string {
  if (!raw.includes('[[NEMORY_CHANGE:')) return raw;
  const key = randomUUID();
  const bindText = (text: string) => {
    if ((text.match(/\[\[NEMORY_(?:CHANGE|CREATE):/gi) ?? []).length !== 1)
      return text;
    const marker = /\[\[NEMORY_CHANGE:[^\r\n]{1,2048}?\]\]/.exec(text);
    if (!marker) return text;
    const before = text.slice(0, marker.index).trimEnd();
    const after = text.slice(marker.index + marker[0].length).trimStart();
    // A standalone control can precede the prose or follow it. Leave examples
    // embedded in prose, ambiguous batches and incomplete controls untouched.
    if (Boolean(before.trim()) === Boolean(after.trim())) return text;
    const prose = before || after;
    return `${prose.trim()}\n\n[[NEMORY_CHANGE:${key}]]`;
  };
  if (response.format === 'text') return bindText(raw);
  if (!response.textField) return raw;
  const obj = parseResponseObject(raw);
  if (!obj) return raw;
  const fields =
    response.textField === 'shortText'
      ? ['shortText', 'fullText']
      : [response.textField];
  let changed = false;
  for (const field of fields) {
    const value = obj[field];
    if (typeof value !== 'string') continue;
    const bound = bindText(value);
    if (bound !== value) {
      obj[field] = bound;
      changed = true;
    }
  }
  if (!changed) return raw;
  return JSON.stringify(obj);
}

function parseResponseObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Bridge the structured journal decision to the existing device receipt.
 * A missing decision is an invalid response, never evidence of a saved change. */
export function bindStructuredPlannerAction(raw: string): string {
  const obj = parseResponseObject(raw);
  if (!obj) throw new Error('INVALID_PLANNER_ACTION_RESPONSE');
  const action = obj.plannerAction;
  if (
    (action !== 'none' && action !== 'create' && action !== 'change') ||
    [obj.shortText, obj.fullText].some(
      (value) =>
        typeof value === 'string' && /\[\[NEMORY_(CHANGE|CREATE):/i.test(value),
    )
  ) {
    throw new Error('INVALID_PLANNER_ACTION_RESPONSE');
  }
  if (action === 'none') return raw;
  const intent = [obj.shortText, obj.fullText].find(
    (value): value is string =>
      typeof value === 'string' && value.trim().length > 0,
  );
  if (!intent) throw new Error('MISSING_PLANNER_ACTION_INTENT');
  const marker = `[[NEMORY_${action === 'change' ? 'CHANGE' : 'CREATE'}:${randomUUID()}]]`;
  obj.shortText = obj.fullText = `${intent.trim()}\n\n${marker}`;
  return JSON.stringify(obj);
}
