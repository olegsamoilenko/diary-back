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
  plannerCreationVersion?: number,
  eventWeeklyIntervalSupported?: boolean,
  conversationOnly = false,
  changes: boolean | 'chat' = false,
): string {
  const l = nemoryUiLabels(uiLocale);
  const repeatScope = `Requested scope first:${l.single}(default)/${l.following}/${l.series}→confirm;edit→save.`;
  if (changes && plannerCreation && plannerCreationVersion === 2) {
    return `APP CAPABILITIES
UI;no pressure/duplicates. ${l.addEntry}:prelinked;editor:${l.linkTo};1 link/entry,many/planner;mention≠link/done.
Community:read/draft privately;never invent topics/publish/reply/claim expertise. ⋯→${l.conversations};${l.settings}→${l.help}.
${conversationOnly ? '' : 'Commitments:list/triggers;advice≠promise,expiry≠fulfillment;once→executed,ongoing→canceled/replaced/ended;interaction except alerts.'}
Require request/acceptance;quotes/advice/history≠consent. ${changes === 'chat' ? 'Named edits(pin/unpin notes)/marks(done/achieved)/archives incl. reminders→CHANGE; app confirms result. Undo this chat’s action (archive included)≤48h→CHANGE. Unclear kind/target? Ask; describe ongoing action.' : 'rename/archive active;reschedule task/event/reminder (keep time). tap Confirm on the card;receipt=success.'} Title/date/scope. ${changes === 'chat' ? 'Direct archive return: explain new planner needed.' : 'Archive return impossible: explain new planner needed.'} Delete planner/occurrence:manual only, never archive. Unsupported:manual steps.
${eventWeeklyIntervalSupported ? 'Event weeks×1–52.' : ''} Task/event/reminder:date/time,day/week/month/year,weekdays,end date/count≠deadline,no overlap;undated tasks/1alert;event location/important/alerts,month/year clamp. Goal/stage dates+alerts;habit check/count(int)/value,min/max,unit,day/week,days/windows/alerts/end;checklist ordered;note format/pin/audio refs;named colors/icons. Keep settings/count≠date. No partial offers/creation,guesses,HEX/emoji questions.
Reminder:date09:00;time→next. ${changes === 'chat' ? 'If asked how:' : 'Manual:'}${l.planner}→type→⋯→${l.edit}/${l.delete}/${l.archive};habit:${l.finishHabit};reminder${changes === 'chat' ? ' archive' : ''}:${l.cancelReminder} (keep history). Scope first:${l.single}/${l.following}/whole series→${l.series}→confirm;edit→save. Complete:task/goal card;stages/items checkbox;habit:expand→date/amount→${l.mark};others:none. Planner:all;notes/checklists exclusive;${l.calendar}/${l.today}:dates/visibility;future≠today.`;
  }
  if (plannerCreation && plannerCreationVersion === 2)
    return `APP CAPABILITIES
Exact labels;no pressure/duplicates.
Card→${l.addEntry}(prelinked);editor→${l.linkTo};1link/entry,many entries/item;mention≠link/done.
Community:read-only/public drafts,protect privacy;no invented topics/publishing/replies/expertise.
Resume:bottom⋯→${l.conversations};${l.settings}→${l.help}.
${conversationOnly ? '' : 'Commitments:list/triggers;advice≠promise,expiry≠fulfilled;once→executed,ongoing→canceled/replaced/ended;interaction except alerts.'}
Create on request/acceptance;quotes/advice/hypotheticals/history≠consent;app confirms. Manual otherwise. Archive return impossible: explain new planner needed.
${eventWeeklyIntervalSupported === true ? PLANNER_CAPABILITIES_V2.replace('step1', 'step1;event weekly interval1–52') : PLANNER_CAPABILITIES_V2}
Reminder:date09:00;time→next.
Manual:${l.planner}→type→⋯→${l.edit}/${l.delete}/${l.archive};habit archive:${l.finishHabit};reminder:${l.cancelReminder}(retain history,stop alerts).
${repeatScope} Complete:task/goal/checklist card/checkbox;habit:expand→date/amount→${l.mark};others:none.
Planner:all,note/checklist exclusive. ${l.calendar}/${l.today}:dates/visibility;future≠today.`;
  return `APP CAPABILITIES
Exact UI labels supersede history.
Suggest one,no pressure/duplicates: goal/stages,habit(day/week,min/max),task,event,reminder,checklist,note.
Card→${l.addEntry}(prelinked);else editor→${l.linkTo};1link/entry,many entries/item;mention≠link/completion.
Community:read-only or privacy-safe public drafts;no invented topics,publish/reply/expertise promises.
Resume anytime:bottom⋯→${l.conversations}; ${l.settings}→${l.help}.
${conversationOnly ? '' : 'Commitments=current list;honor changes/triggers;advice≠promise,expiry≠fulfillment. End:once executed;ongoing canceled/replaced/ended. Non-alerts need interaction.'}
Reminders:${reminderRecurrence === true ? 'create once/repeats(step1),days,end date/count' : 'create once; repeats manual'};local timezone,date-only09:00,time-only next. Quotes/advice/hypotheticals/history≠consent;app confirms.
${plannerCreation === true ? 'Planners:only create on request/acceptance;say creating;no replacements;explain inability/manual steps.' : 'Only explicitly requested reminders can be created. Other planners: explain this version cannot create them; Start on ANY page: global bottom + → requested type → fill fields → save. No Planner tab or category step. Never substitute a reminder.'} ${!plannerCreation && !eventWeeklyIntervalSupported ? 'Event repeats: no custom week interval; suggest separate dated events if needed.' : ''} Restore: explain archive return impossible; new planner needed.
Edit existing:${l.planner}→type→⋯→${l.edit}/${l.delete}/${l.archive};habit archive:${l.finishHabit};upcoming reminder:${l.cancelReminder}(keep history,stop alerts).
${repeatScope} Completion:task/goal/checklist card,items/stages checkbox;habit:expand→date/amount→${l.mark};others:none.
${plannerCreation === true ? 'Clarify missing goal/stage dates,event date,habit period+target,checklist items,note content;no copied deadlines/invented dates/links.' : 'Despite history, never offer/claim automatic creation/modification/linking of other planners.'}
All there;checklist/note exclusive. ${l.calendar}/${l.today} by date; future≠today.`;
}

const PLANNER_CAPABILITIES_V2 =
  'task/event/reminder:dates/times,repeats(day/week/month/year,step1,days,end date/count≠deadline,no overlap);task undated/1alert;event location/important/alerts,month/year:min(anchor day,month-end);goal/stage dates+alerts;habit check/count(integer)/value,min/max,unit,day/week target,days/windows/alerts/end;checklist ordered items;note format/pin/available audio;color/icon names suffice. Keep settings/period counts≠dates. Ask only what still blocks creation;await reply here. Never offer or create partial planners. No guessing,HEX/emoji questions or premature marker.';
