import { describe, expect, it } from '@jest/globals';
import { estimateNonOpenAiTokens } from './estimate-non-openai-tokens';

describe('estimateNonOpenAiTokens', () => {
  it('matches the frontend Unicode-aware Anthropic estimate', () => {
    expect(estimateNonOpenAiTokens(['abcdef'])).toBe(2);
    expect(estimateNonOpenAiTokens(['😊😊😊'])).toBe(1);
    expect(estimateNonOpenAiTokens([''])).toBe(0);
    expect(estimateNonOpenAiTokens(['abc', 'defg'])).toBe(3);
  });
});
