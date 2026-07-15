import { DiaryTabVariant } from '../types';

export type DiaryTabExperimentAssignment = {
  diaryTabEnabled: boolean;
  diaryTabVariant: DiaryTabVariant;
};

export type DiaryTabExperimentConfig = {
  enabled: boolean;
  minBuild: number;
};

export function getDiaryTabExperimentConfig(
  env: NodeJS.ProcessEnv = process.env,
): DiaryTabExperimentConfig {
  const minBuild = Number(env.DIARY_TAB_EXPERIMENT_MIN_BUILD);
  const hasValidMinBuild = Number.isInteger(minBuild) && minBuild > 0;

  return {
    enabled:
      env.DIARY_TAB_EXPERIMENT_ENABLED === 'true' && hasValidMinBuild,
    minBuild: hasValidMinBuild ? minBuild : Number.MAX_SAFE_INTEGER,
  };
}

export function assignDiaryTabExperiment(
  userId: number,
  appBuild: number,
  config: DiaryTabExperimentConfig = getDiaryTabExperimentConfig(),
): DiaryTabExperimentAssignment {
  if (!config.enabled || appBuild < config.minBuild) {
    return {
      diaryTabEnabled: true,
      diaryTabVariant: DiaryTabVariant.LEGACY,
    };
  }

  const diaryTabEnabled = userId % 2 === 0;

  return {
    diaryTabEnabled,
    diaryTabVariant: diaryTabEnabled
      ? DiaryTabVariant.DIARY_AND_CALENDAR
      : DiaryTabVariant.CALENDAR_ONLY,
  };
}
