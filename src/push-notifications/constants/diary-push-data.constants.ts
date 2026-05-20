import { DiaryPushType } from '../types/diary';

export const DIARY_IDLE_REMINDER_PUSH_TYPE: DiaryPushType =
  'diary_idle_reminder';

export const DIARY_IDLE_REMINDER_PUSH_DATA = {
  type: DIARY_IDLE_REMINDER_PUSH_TYPE,
  screen: 'diary',
} as const;
