import type { TimeContext } from '../types/date';

/** One representation for a new question and its persisted history replay. */
export function formatDialogQuestion(text: string, time: TimeContext): string {
  const cleaned = text
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  return `Q: ${cleaned}\n\n[CURRENT_TIME_CONTEXT]\n- timeZone: ${time.timeZone}\n- nowLocalText: ${time.nowLocalText}\n- locale: ${time.locale}`;
}
