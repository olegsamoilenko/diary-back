/** A change can never create a replacement planner or a separate reminder. */
// Illustrate the extra root fields inside the capsule's exact JSON format.
// The example describes structure; the current user request supplies the values.
export const chatChangeCapsuleFields = `
  "authorizationQuote": "<verbatim words from the CURRENT user authorizing this change>",
  "plannerChange": {"operation":"edit","kind":"note","title":"<current target>","patch":{"pinned":true}},`;

const dispositionRule =
  'CURRENT user explicitly asks to archive a named planner: return {"authorizationQuote":"<exact current request>","requestedDisposition":"archive","plannerChange":{"operation":"archive","kind":"<requested kind>","title":"<named target>"}}. Device resolves the title even without history. Include day/scope only if specified. Deletion (including a series): requestedDisposition="delete", plannerChange=null. Never substitute archive. Direct return from archive: requestedDisposition="restore", plannerChange=null. Explicit reversal of a previous action (including archiving): omit requestedDisposition, return plannerChange with operation="undo". The device checks eligibility.';
export const plannerChangeExtraction = `
PLANNER CHANGE ONLY
${dispositionRule}
From an explicit CURRENT user request or its unambiguous clarification extract one complete change; history identifies context only. No changes for questions, quotes, suggestions, deletion, marking, unsupported fields, mixed or partial requests. Never invent a target title, occurrence, scope or old date. No plannerCreations, scheduledReminders or scheduledReminderUpdates.
Return sibling JSON fields: "authorizationQuote" (verbatim CURRENT user text authorizing the change) and "plannerChange" (null or {kind:"task|event|reminder|goal|habit|checklist|note",title:existing title,operation:"edit|archive",scope?:"single|following|series",day?:original local YYYY-MM-DD,newTitle?:requested title,newDay?:destination local YYYY-MM-DD}). Move dates only on dated tasks/events/reminders, preserving time/duration. Map explicit scope: one occurrence → single, this and later → following, entire series → series; omit only if unspecified. Return null if user also requested other edits; never silently drop them. Resolve relative dates using request clock. Never use model-supplied ids.`;

export const chatChangeExtraction = `CHAT PLANNER ACTION. One authorized current change/clarification; history identifies targets only. Questions, quoted actions, deletions, uncertain or unrepresentable intent: null. No partial edits/creation. Siblings {"authorizationQuote":"verbatim CURRENT user words","plannerChange":command}. Omit unchanged fields, including status. Undo latest: {operation:"undo"}; named undo: {"operation":"undo","kind":"<kind>","title":"<saved title>"} from the uniquely matching successful receipt, even if the user inflects the name. Only add day/actionTime when explicitly selected; never use message time. Ambiguous: clarify. Other commands: operation (edit/archive/mark), kind (task/event/reminder/habit/goal/checklist/note), current title. Move task/event/reminder: {"operation":"edit","kind":"event","title":"…","scope":"single","day":"YYYY-MM-DD","newDay":"YYYY-MM-DD"} (keep time/duration); other scopes: following/series. newTitle renames planner; selectors: matchTime HH:mm,matchHint(location). Undate task: "patch":{"clearDates":true}. Patch: description (Markdown), color (#RRGGBB), icon, cardBackground (theme/accent or palette tone), showInToday, showInCalendar, startDate(goal/habit), endDate,time,endTime,allDay,frequency(none/daily/weekly/monthly/yearly),interval,weekdays(1=Mon),recurrenceEnd({type:never/count/date,count/dayLocal}),alerts([{mode:offset,offsetMinutes}|{mode:custom,dayLocal,timeLocal}]),location,important,priority,note pin/unpin (kind:"note", patch:{"pinned":true|false}; a named planner note need not appear in this chat; device resolves its title; do not apply to other stated kinds),items(string[]),milestones([{title,dueDate}] for goal/task),stage/item rename: "patch":{"itemChange":{"title":"old","newTitle":"new"}}; reorder: {"title":"old","position":2} in patch.itemChange (1-based); deadline: "patch":{"itemChange":{"title":"existing stage","dueDate":"YYYY-MM-DD"}},goalReminder({enabled,offsetDays,hour,minute,includeMilestones}),habit (amount only: "patch":{"habit":{"target":12}}; also mode,unit,customUnitLabel,comparator,weeklyMode,daysOfWeek,windows,reminder:{time:"HH:mm",enabled?,daysOfWeek?,additionalTimes?,offsetMinutes?}). Mark: boolean done, optional current item title; habit: value + local day. Recurring mark: one date. No invented IDs/details.`;

export function chatChangeInstructions(lookup?: boolean, facts?: string) {
  const instructions = chatChangeExtraction + '\n' + dispositionRule;
  if (!lookup) return instructions;
  return (
    instructions +
    '\nArchive: for archiveStatusKinds (older taskArchiveHints: task only), explicit status selects matchHint:"completed" or "active". Omit when unspecified. Keep status words outside the quoted title.' +
    (facts
      ? '\nLOCAL LOOKUP FACTS are current data. Keep the same selector and scope. Resolve the item by exact saved title if unique; otherwise null. For reorder return {"authorizationQuote":"<current request>","plannerChange":{"operation":"edit","kind":"checklist","title":"<saved list>","patch":{"itemChange":{"title":"<saved item>","position":1}}}} using the requested one-based position and actual kind.'
      : '\nQuoted names identify targets. For an explicitly named item and absolute rank, edit directly with patch.itemChange={title,position}; the device checks the saved item. For relative moves or edits needing saved values request a lookup in the same envelope: {"authorizationQuote":"<current request>","plannerChange":{"operation":"edit","kind":"checklist","title":"<named list>","lookup":"items"}}. Use actual kind, title and applicable day/scope/matchTime/matchHint. Use schedule for dates/times, items for ordered stages/items. A renewed request authorizes a fresh change. Checklist mark: item=verbatim identifying phrase.')
  );
}

// A move or rename has the same meaning inside patch. Conflicting values are never applied.
function canonicalChatCommand(command: Record<string, unknown>) {
  if (command.operation !== 'edit') return command;
  if (
    (command.kind === 'goal' || command.kind === 'checklist') &&
    'itemChange' in command
  ) {
    const { itemChange, patch, ...rest } = command;
    if (
      patch !== undefined &&
      (!patch ||
        typeof patch !== 'object' ||
        Array.isArray(patch) ||
        'itemChange' in patch)
    )
      return null;
    command = {
      ...rest,
      patch: { ...(patch as Record<string, unknown> | undefined), itemChange },
    };
  }
  if (
    !command.patch ||
    typeof command.patch !== 'object' ||
    Array.isArray(command.patch)
  )
    return command;
  const patch = { ...(command.patch as Record<string, unknown>) };
  const result = { ...command };
  for (const field of ['newDay', 'newTitle']) {
    if (!(field in patch)) continue;
    if (field in result && result[field] !== patch[field]) return null;
    result[field] = patch[field];
    delete patch[field];
  }
  if (Object.keys(patch).length) result.patch = patch;
  else delete result.patch;
  return result;
}

type ItemLookup = { supported?: boolean; facts?: string };

function checkChecklistLabels(command: Record<string, unknown>, userText: string, lookup?: ItemLookup) {
  if (command.kind !== 'checklist' || command.operation !== 'edit') return command;
  const patch = command.patch as Record<string, unknown> | undefined;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return command;
  // A rank in the request is evidence for position, never for a new label.
  // Other mentions are retained, e.g. 'rename "Keys" to 7 and move it to position 1'.
  const labelText = userText.normalize('NFKC')
    .replace(/(?<!\p{L})(?:позиці[яюї]|місц[еі]|position|place|slot|platz|stelle|pozycj[ęia]|miejsce)\s*[:#№]?\s*\p{N}+(?!\p{N})/giu, ' ')
    .replace(/(?<![\p{L}\p{N}])\p{N}+(?:[-‑]?(?:ше|те|ге|є|е|й|у)|st|nd|rd|th|\.)?\s+(?:місц[еі]|позиці[яюї]|position|place|platz|stelle|miejsce|pozycj[ęia])(?!\p{L})/giu, ' ');
  const words = new Set(labelText.match(/[\p{L}\p{N}]+/gu) ?? []);
  const unmentionedNumber = (label: unknown): label is string => {
    if (typeof label !== 'string') return false;
    const value = label.normalize('NFKC').trim();
    return /^\p{N}+$/u.test(value) && !words.has(value);
  };
  const edit = patch.itemChange as { title?: unknown; newTitle?: unknown } | undefined;
  if (edit?.newTitle !== edit?.title && unmentionedNumber(edit?.newTitle)) return null;
  const numbers = Array.isArray(patch.items) ? patch.items.filter(unmentionedNumber) : [];
  if (!numbers.length) return command;
  // An existing numeric label may legitimately occur in a reordered list.
  if (lookup?.facts) {
    try {
      const facts = JSON.parse(lookup.facts);
      if (facts.kind !== command.kind || facts.title !== command.title || !Array.isArray(facts.items)) return null;
      const saved = facts.items.map((i: { title?: unknown } | null) => i?.title);
      return numbers.every(label => saved.includes(label)) ? command : null;
    } catch {
      return null;
    }
  }
  if (lookup?.supported && Object.keys(patch).length === 1 &&
      Object.keys(command).every(k => ['kind', 'operation', 'title', 'patch'].includes(k))) {
    return { kind: command.kind, operation: command.operation, title: command.title, lookup: 'items' };
  }
  return null;
}

export function plannerChangeResult(
  raw: unknown,
  currentUserText: string,
  chatActions = false,
  lookup?: ItemLookup,
) {
  const envelope =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const value = envelope.plannerChange;
  let plannerChange: Record<string, unknown> | null = null;
  let reason = value == null ? 'missing_command' : 'invalid_shape';
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    // Some extractor replies put evidence on the command. It is metadata,
    // not an editable field. Preserve all other keys for strict client validation.
    const { authorizationQuote, ...command } = value as Record<string, unknown>;
    const quotes = [envelope.authorizationQuote, authorizationQuote].filter(
      (q) => q !== undefined,
    );
    reason = quotes.length ? 'authorization_mismatch' : 'missing_authorization';
    if (
      quotes.length &&
      quotes.every(
        (q) =>
          typeof q === 'string' &&
          q.trim().length > 0 &&
          currentUserText.includes(q.trim()),
      )
    ) {
      if (
        envelope.requestedDisposition === 'delete' ||
        command.operation === 'delete' ||
        envelope.requestedDisposition === 'restore' ||
        command.operation === 'restore'
      ) {
        reason = 'unsupported_operation';
      } else if (
        command.operation === 'archive' &&
        envelope.requestedDisposition !== 'archive'
      ) {
        reason = 'missing_archive_intent';
      } else {
        plannerChange = chatActions ? canonicalChatCommand(command) : command;
        if (!plannerChange) reason = 'conflicting_fields';
        else if (chatActions) {
          plannerChange = checkChecklistLabels(plannerChange, currentUserText, lookup);
          if (!plannerChange) reason = 'authorization_mismatch';
        }
      }
    }
  }
  return {
    plannerChange,
    ...(chatActions && !plannerChange ? { plannerChangeError: reason } : {}),
    plannerCreations: [],
    scheduledReminders: [],
    scheduledReminderUpdates: [],
  };
}
