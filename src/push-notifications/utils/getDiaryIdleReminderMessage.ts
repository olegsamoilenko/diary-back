import {
  DIARY_IDLE_REMINDER_MESSAGES,
  DiaryIdleReminderMessage,
} from '../constants/diary-idle-reminder-messages.constants';
import { resolveLocale } from './resolveLocale';

export function getDiaryIdleReminderMessage(params: {
  lang?: string | null;
  sentCount: number;
}): DiaryIdleReminderMessage {
  const resolvedLang = resolveLocale(params.lang);

  const messages = DIARY_IDLE_REMINDER_MESSAGES[resolvedLang];

  const index = Math.min(params.sentCount, messages.length - 1);

  return messages[index];
}
