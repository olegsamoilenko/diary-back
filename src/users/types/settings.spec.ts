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
    expect(normalizeAiModel('claude-sonnet-5')).toBe(AiModel.CLAUDE_SONNET_5_5);
    expect(normalizeAiModel('claude-sonnet-5-5')).toBe(
      AiModel.CLAUDE_SONNET_5_5,
    );
    expect(AI_MODEL_STORAGE_VALUES).toContain('claude-sonnet-5-5');
    expect(AI_MODEL_STORAGE_VALUES).toContain('claude-sonnet-5');
    expect(normalizeAiModel('claude-opus-5')).toBe(AiModel.CLAUDE_OPUS_5);
    expect(AI_MODEL_STORAGE_VALUES).toContain('claude-opus-5');
    expect(normalizeAiModel('claude-opus-4-7')).toBe(AiModel.CLAUDE_OPUS_4_7);
    expect(normalizeAiModel('claude-sonnet-4-6')).toBe(
      AiModel.CLAUDE_SONNET_4_6,
    );
    expect(normalizeAiModel('claude-haiku-4-5')).toBe(AiModel.CLAUDE_HAIKU_4_5);
    expect(normalizeAiModel('qwen3.8-max')).toBe(AiModel.QWEN_3_8_MAX);
    expect(AI_MODEL_STORAGE_VALUES).toContain('qwen3.8-max');
    expect(normalizeAiModel(AiModel.GPT_5_4)).toBe(AiModel.GPT_5_4);
    expect(normalizeAiModel(AiModel.GPT_5_6_LUNA)).toBe(AiModel.GPT_5_6_LUNA);
  });

  it('keeps GPT-5.2 available to the API and database', () => {
    expect(Object.values(AiModel)).toContain('gpt-5.2');
    expect(AI_MODEL_STORAGE_VALUES).toContain('gpt-5.2');
  });
});
