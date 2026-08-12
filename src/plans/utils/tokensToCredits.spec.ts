import { describe, expect, it } from '@jest/globals';
import { AiModel } from 'src/users/types';
import { tokensToCredits } from './tokensToCredits';

describe('tokensToCredits', () => {
  it('uses the averaged GPT-5.6 Terra price for input and output tokens', () => {
    expect(
      tokensToCredits(AiModel.GPT_5_6_TERRA, 1_000_000, 1_000_000),
    ).toEqual({
      inputUsedCredits: 30_000,
      outputUsedCredits: 150_000,
    });
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

  it('bills cached Terra input at the cached-input rate', () => {
    expect(
      tokensToCredits(AiModel.GPT_5_6_TERRA, 1_000_000, 0, 800_000),
    ).toEqual({
      inputUsedCredits: 8_400,
      outputUsedCredits: 0,
    });
  });

  it('clamps invalid cached input to the reported input total', () => {
    expect(
      tokensToCredits(AiModel.GPT_5_6_TERRA, 1_000_000, 0, 2_000_000),
    ).toEqual({
      inputUsedCredits: 3_000,
      outputUsedCredits: 0,
    });
  });

  it('bills GPT-5.6 cache writes at the explicit-cache write rate', () => {
    expect(
      tokensToCredits(AiModel.GPT_5_6_TERRA, 1_000_000, 0, 0, 800_000),
    ).toEqual({
      inputUsedCredits: 36_000,
      outputUsedCredits: 0,
    });
  });

  it('bills the measured cached dialog usage from the provider response', () => {
    expect(
      tokensToCredits(AiModel.GPT_5_6_TERRA, 13_284, 108, 13_189, 0),
    ).toEqual({
      inputUsedCredits: 43,
      outputUsedCredits: 17,
    });
  });

  it('uses Anthropic 5-minute cache write and read rates', () => {
    expect(
      tokensToCredits(
        AiModel.CLAUDE_SONNET_4_6,
        1_000_000,
        0,
        800_000,
        100_000,
      ),
    ).toEqual({
      inputUsedCredits: 9_150,
      outputUsedCredits: 0,
    });
  });

  it('never bills cache reads and writes for more than total input', () => {
    expect(
      tokensToCredits(AiModel.GPT_5_6_TERRA, 1_000_000, 0, 800_000, 800_000),
    ).toEqual({
      inputUsedCredits: 9_900,
      outputUsedCredits: 0,
    });
  });

  it('keeps GPT-5.2 pricing for older app versions', () => {
    expect(tokensToCredits(AiModel.GPT_5_2, 1_000_000, 1_000_000)).toEqual({
      inputUsedCredits: 17_500,
      outputUsedCredits: 140_000,
    });
  });
});
