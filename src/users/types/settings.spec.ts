import { describe, expect, it } from '@jest/globals';
import {
  AiModel,
  AI_MODEL_STORAGE_VALUES,
  DEFAULT_AI_MODEL,
  normalizeAiModel,
} from './settings';

describe('AI model settings', () => {
  it('uses GPT-5.6 Terra as the default model', () => {
    expect(DEFAULT_AI_MODEL).toBe(AiModel.GPT_5_6_TERRA);
  });

  it('keeps GPT-5.2 unchanged for older app versions', () => {
    expect(normalizeAiModel('gpt-5.2')).toBe(AiModel.GPT_5_2);
  });

  it('keeps supported model selections unchanged', () => {
    expect(normalizeAiModel(AiModel.GPT_5_4)).toBe(AiModel.GPT_5_4);
    expect(normalizeAiModel(AiModel.GPT_5_6_LUNA)).toBe(
      AiModel.GPT_5_6_LUNA,
    );
  });

  it('keeps GPT-5.2 available to the API and database', () => {
    expect(Object.values(AiModel)).toContain('gpt-5.2');
    expect(AI_MODEL_STORAGE_VALUES).toContain('gpt-5.2');
  });
});
