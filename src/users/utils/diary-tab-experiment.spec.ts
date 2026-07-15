import { describe, expect, it } from '@jest/globals';
import { DiaryTabVariant } from '../types';
import {
  assignDiaryTabExperiment,
  getDiaryTabExperimentConfig,
} from './diary-tab-experiment';

describe('assignDiaryTabExperiment', () => {
  const enabledConfig = { enabled: true, minBuild: 100 };

  it('keeps the diary tab enabled when the experiment is disabled', () => {
    expect(
      assignDiaryTabExperiment(167, 100, {
        enabled: false,
        minBuild: 100,
      }),
    ).toEqual({
      diaryTabEnabled: true,
      diaryTabVariant: DiaryTabVariant.LEGACY,
    });
  });

  it('keeps the diary tab enabled below the minimum build', () => {
    expect(assignDiaryTabExperiment(167, 99, enabledConfig)).toEqual({
      diaryTabEnabled: true,
      diaryTabVariant: DiaryTabVariant.LEGACY,
    });
  });

  it('assigns odd user ids to calendar only', () => {
    expect(assignDiaryTabExperiment(167, 100, enabledConfig)).toEqual({
      diaryTabEnabled: false,
      diaryTabVariant: DiaryTabVariant.CALENDAR_ONLY,
    });
  });

  it('assigns even user ids to diary and calendar', () => {
    expect(assignDiaryTabExperiment(168, 100, enabledConfig)).toEqual({
      diaryTabEnabled: true,
      diaryTabVariant: DiaryTabVariant.DIARY_AND_CALENDAR,
    });
  });

  it('keeps the assignment stable for the same user id', () => {
    expect(assignDiaryTabExperiment(168, 100, enabledConfig)).toEqual(
      assignDiaryTabExperiment(168, 100, enabledConfig),
    );
  });

  it('requires both the flag and a valid minimum build', () => {
    expect(
      getDiaryTabExperimentConfig({
        DIARY_TAB_EXPERIMENT_ENABLED: 'true',
      }),
    ).toEqual({
      enabled: false,
      minBuild: Number.MAX_SAFE_INTEGER,
    });
  });
});
