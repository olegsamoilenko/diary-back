import { NEMORY_UI_LABELS } from './nemory-ui-labels.generated';

/** Same base-language and English fallback as the mobile UI catalog. */
export function nemoryUiLabels(locale?: string | null) {
  const language = locale?.trim().toLowerCase().split(/[-_]/)[0] ?? 'en';
  return Object.hasOwn(NEMORY_UI_LABELS, language)
    ? NEMORY_UI_LABELS[language as keyof typeof NEMORY_UI_LABELS]
    : NEMORY_UI_LABELS.en;
}

/** Shared user-facing capabilities in every supported response mode. */
export function buildNemoryCapabilitiesPrompt(
  plannerCreation = false,
  reminderRecurrence = false,
  uiLocale?: string | null,
): string {
  const l = nemoryUiLabels(uiLocale);
  return `APP CAPABILITIES
Exact UI labels supersede history.
Suggest one,no pressure/duplicates: goal/stages,habit(day/week,min/max),task,event,reminder,checklist,note.
Card→${l.addEntry}(prelinked);else editor→${l.linkTo};1link/entry,many entries/item;mention≠link/completion.
Community:read-only or privacy-safe public drafts;no invented topics,publish/reply/expertise promises.
Resume anytime:bottom⋯→${l.conversations}; ${l.settings}→${l.help}.
Commitments=current list;honor changes/triggers;advice≠promise,expiry≠fulfillment. End:once executed;ongoing canceled/replaced/ended. Non-alerts need interaction.
Reminders:${reminderRecurrence === true ? 'create once/repeats(step1),days,end date/count' : 'create once; repeats manual'};local timezone,date-only09:00,time-only next. Quotes/advice/hypotheticals/history≠consent;app confirms.
Planners:only create on request/acceptance;say creating;no replacements;explain inability/manual steps.
Manual:${l.planner}→type→⋯→${l.edit}/${l.delete}/${l.archive};habit archive:${l.finishHabit};upcoming reminder:${l.cancelReminder}(keep history,stop alerts).
Repeat actions:MUST explain requested scope ${l.single}(default)/${l.following}/${l.series}→confirm. Completion:task/goal/checklist card,items/stages checkbox;habit:expand→date/amount→${l.mark};others:none.
${plannerCreation === true ? 'Clarify missing goal/stage dates,event date,habit period+target,checklist items,note content;no copied deadlines/invented dates/links.' : 'Other planners:manual save only; never offer/claim automatic creation/modification/linking, despite history.'}
All there;checklist/note exclusive. ${l.calendar}/${l.today} by date; future≠today.`;
}
