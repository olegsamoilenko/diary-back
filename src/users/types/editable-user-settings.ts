import type { UserSettings } from '../entities/user-settings.entity';
import { BadRequestException } from '@nestjs/common';

export type UserSettingsUpdate = Partial<UserSettings> & {
  initializeThemeSelection?: boolean;
};

// Public preferences, including supported older-client fields and build refresh.
// Device identity/metadata is owned by account creation/sync, not this endpoint.
const editableFields = [
  'theme',
  'themeSelection',
  'font',
  'timeFormat',
  'dateFormat',
  'firstDayOfWeek',
  'lang',
  'conversationLanguage',
  'aiModel',
  'aiAnalysisEnabledByDefault',
  'checkinAiAnalysisEnabledByDefault',
  'shortAiReflectionEnabled',
  'entryMediaAnalysisMode',
  'timezone',
  'pushNotificationsEnabled',
  'calendarShowEventIcons',
  'calendarShowGoalIcons',
  'calendarShowMood',
  'calendarShowEventIconsPast',
  'calendarShowGoalIconsPast',
  'calendarEventIconsFutureRange',
  'calendarGoalIconsFutureRange',
  'diaryTabEnabled',
  'metricTracking',
  'checkinSettings',
  'onboardingVariant',
  'appVersion',
  'appBuild',
  'initializeThemeSelection',
] as const satisfies readonly (keyof UserSettingsUpdate)[];

export function pickEditableUserSettings(
  input: UserSettingsUpdate,
): UserSettingsUpdate {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('Invalid settings update');
  }
  // Build a fresh object from own properties only. Unknown/identity fields never
  // reach persistence, even when this service is invoked without HTTP pipes.
  return Object.fromEntries(
    editableFields
      .filter(
        (key) =>
          Object.prototype.hasOwnProperty.call(input, key) &&
          input[key] !== undefined,
      )
      .map((key) => [key, input[key]]),
  ) as UserSettingsUpdate;
}
