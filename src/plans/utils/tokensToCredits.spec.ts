import { describe, expect, it } from '@jest/globals';
import { AiModel } from 'src/users/types';
import { tokensToCredits } from './tokensToCredits';

describe('tokensToCredits', () => {
  it('uses the averaged GPT-5.6 Terra price for input and output tokens', () => {
    expect(tokensToCredits(AiModel.GPT_5_6_TERRA, 1_000_000, 1_000_000)).toEqual(
      {
        inputUsedCredits: 30_000,
        outputUsedCredits: 150_000,
      },
    );
  });

  it('rounds each Terra credit component up', () => {
    expect(tokensToCredits(AiModel.GPT_5_6_TERRA, 1, 1)).toEqual({
      inputUsedCredits: 1,
      outputUsedCredits: 1,
    });
  });

  it('uses the averaged GPT-5.6 Luna price for memory extraction', () => {
    expect(tokensToCredits(AiModel.GPT_5_6_LUNA, 1_000_000, 1_000_000)).toEqual(
      {
        inputUsedCredits: 3_000,
        outputUsedCredits: 15_000,
      },
    );
  });

  it('keeps GPT-5.2 pricing for older app versions', () => {
    expect(tokensToCredits(AiModel.GPT_5_2, 1_000_000, 1_000_000)).toEqual({
      inputUsedCredits: 17_500,
      outputUsedCredits: 140_000,
    });
  });
});
