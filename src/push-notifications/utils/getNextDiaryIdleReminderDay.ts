import {
  DIARY_IDLE_REMINDER_DAYS,
  DIARY_IDLE_REMINDER_WEEKLY_AFTER_DAYS,
  DIARY_IDLE_REMINDER_WEEKLY_INTERVAL_DAYS,
} from '../constants/diary-idle-reminder.constants';

export function getNextDiaryIdleReminderDay(sentCount: number): number {
  if (sentCount < DIARY_IDLE_REMINDER_DAYS.length) {
    return DIARY_IDLE_REMINDER_DAYS[sentCount];
  }

  const weeklyIndex = sentCount - DIARY_IDLE_REMINDER_DAYS.length + 1;

  return (
    DIARY_IDLE_REMINDER_WEEKLY_AFTER_DAYS +
    weeklyIndex * DIARY_IDLE_REMINDER_WEEKLY_INTERVAL_DAYS
  );
}
