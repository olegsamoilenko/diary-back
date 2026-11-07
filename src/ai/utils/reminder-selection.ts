import type { ActiveScheduledReminderV2Dto } from '../dto/extract-assistant-memory-capsule-v2.dto';

const normalized = (text: string) => text.normalize('NFKC').toLocaleLowerCase().replace(/[«»“”"']/g, '').replace(/\s+/g, ' ').trim();
const asksToStop = (text: string) => /^(?:(?:будь ласка|please|proszę|bitte)[,\s]*)?(?:(?:можеш|можна|can you|could you)[,\s]*)?(?:скасуй|скасувати|архівуй|архівувати|перемісти|прибери|не нагадуй|cancel|archive|stop reminding|anuluj|archiwizuj|odwołaj|sage? ab|archiviere)(?=\s|[,.:!?«"']|$)/iu.test(text.trim());
const clocks = (text: string) => [...text.matchAll(/(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/g)].map(m => `${m[1].padStart(2, '0')}:${m[2]}`);

/** An extraction may propose a key, but it cannot choose among ambiguous items.
 * Resolve an explicit title/clock or a choice against the PREVIOUS displayed
 * list, never against a newly reordered active list. Unknown -> no mutation. */
export function selectedReminderKey(params: {
  userText: string;
  previousAssistantText?: string;
  previousActiveReminders?: ActiveScheduledReminderV2Dto[];
  active: ActiveScheduledReminderV2Dto[];
  currentLocalDate?: string;
}): string | null {
  const raw = params.userText.trim();
  if (/(?:якщо|у разі|гіпотетич|як приклад|\bif\b|\bhypothetical\b|не скасовуй|не архівуй|do not cancel|don't cancel)/iu.test(raw)) return null;
  if (/(?:перемісти)/iu.test(raw) && !/архів/iu.test(raw)) return null;
  if (/(?:прибери)/iu.test(raw) || /(?:скасуй|cancel)\s+(?:видалення|архівування|скасування|deletion|archiving|cancellation)/iu.test(raw)) return null;
  let selection = raw;
  const prior = params.previousAssistantText?.trim() ?? '';
  const ordinal = /^(?:скасуй\s+|cancel\s+)?(?:нагадування\s+)?(перше|друге|третє|четверте|п['’]яте|first|second|third|fourth|fifth|1|2|3|4|5)(?:\s+(?:з них|one))?[.!]?$/iu.exec(raw);
  if (ordinal) {
    const words = ['перше', 'друге', 'третє', 'четверте', "п'яте"];
    const en = ['first', 'second', 'third', 'fourth', 'fifth'];
    const word = ordinal[1].toLowerCase().replace('’', "'");
    const index = /^\d$/.test(word) ? Number(word) : Math.max(words.indexOf(word), en.indexOf(word)) + 1;
    const line = prior.split('\n').find(x => new RegExp(`^\\s*${index}[.)]\\s+`).test(x));
    if (!line || !/нагадув|reminder|przypomni|erinner/iu.test(prior) || !/скас|архів|cancel|archive|anul|archiv/iu.test(prior) || !prior.includes('?')) return null;
    selection = line;
  } else if (/^(так|так,? скасуй|підтверджую|yes|confirm|tak|ja)[.!]?$/iu.test(raw)) {
    // A short yes binds only to an explicit, single reminder confirmation.
    const question = prior.split(/\n\s*\n/).at(-1) ?? '';
    if (!question.endsWith('?') || !asksToStop(question)) return null;
    selection = question;
  } else if (!asksToStop(raw) || !/нагадув|сповіщ|remind|notification|przypomni|erinner/iu.test(raw)) return null;
  if (/(?:не скасовуй|не архівуй|do not cancel|don't cancel|not yet)/iu.test(raw)) return null;
  const text = normalized(selection);
  const source = selection === raw ? params.active : params.previousActiveReminders ?? [];
  const byTitle = source.filter(item => !!item.text.trim() && text.includes(normalized(item.text)));
  const times = clocks(selection);
  const explicitDays: string[] = selection.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [];
  if (!explicitDays.length && params.currentLocalDate && selection === raw) {
    const offset = /(?:завтра|tomorrow|jutro|morgen)/iu.test(raw) ? 1 : /(?:сьогодні|today|dzisiaj|heute)/iu.test(raw) ? 0 : null;
    if (offset !== null) { const date = new Date(`${params.currentLocalDate}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + offset); if (Number.isFinite(date.getTime())) explicitDays.push(date.toISOString().slice(0, 10)); }
  }
  // A displayed choice must still identify the same title; an edited/deleted
  // choice must never fall back to another reminder sharing its clock.
  const clockOnly = selection === raw && /^(?:скасуй|скасувати|архівуй|архівувати|cancel|archive)\s+(?:нагадування|reminder)(?:\s+(?:на|о|at|for|сьогодні|завтра|today|tomorrow|\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}))+[.!]?$/iu.test(raw);
  const candidates = (byTitle.length ? byTitle : times.length && clockOnly ? source : [])
    .filter(item => !times.length || times.includes(item.localTime))
    .filter(item => !explicitDays.length || explicitDays.includes(item.localDate));
  if (candidates.length !== 1) return null;
  const selected = candidates[0];
  return params.active.some(item => item.reminderKey === selected.reminderKey && item.text === selected.text && item.localDate === selected.localDate && item.localTime === selected.localTime) ? selected.reminderKey : null;
}
