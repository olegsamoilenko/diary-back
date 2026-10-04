import { describe, expect, it } from '@jest/globals';
import { AiModel } from 'src/users/types';
import { tokensToCredits } from './tokensToCredits';

describe('tokensToCredits', () => {
  it.each([
    [AiModel.GPT_5_6_TERRA, 40, 144],
    [AiModel.GPT_5_6_LUNA, 4, 15],
    [AiModel.QWEN_3_8_MAX, 40, 72],
    [AiModel.CLAUDE_SONNET_5, 40, 120],
    [AiModel.CLAUDE_SONNET_5_5, 40, 120],
  ])(
    'converts 2,000 input and 1,200 total output tokens for %s',
    (model, input, output) => {
      // Provider output already contains both reasoning and visible answer.
      expect(tokensToCredits(model, 2000, 1200)).toEqual({
        inputUsedCredits: input,
        outputUsedCredits: output,
      });
    },
  );
  it.each([
    [AiModel.GPT_5_6_TERRA, 585, 120, 1171, 180],
    [AiModel.GPT_5_6_LUNA, 59, 12, 118, 18],
  ])(
    'switches the whole %s request above 272,000 tokens including cache',
    (model, shortInput, shortOutput, longInput, longOutput) => {
      expect(tokensToCredits(model, 272000, 1000, 270000, 1000)).toEqual({
        inputUsedCredits: shortInput,
        outputUsedCredits: shortOutput,
      });
      expect(tokensToCredits(model, 272001, 1000, 270000, 1000)).toEqual({
        inputUsedCredits: longInput,
        outputUsedCredits: longOutput,
      });
    },
  );
  it('bills Sonnet 5 with Standard and 5-minute cache prices', () => {
    expect(
      tokensToCredits(AiModel.CLAUDE_SONNET_5, 1_000_000, 1_000_000),
    ).toEqual({ inputUsedCredits: 20_000, outputUsedCredits: 100_000 });
    expect(
      tokensToCredits(
        AiModel.CLAUDE_SONNET_5,
        1_000_000,
        100_000,
        800_000,
        100_000,
      ),
    ).toEqual({ inputUsedCredits: 6_100, outputUsedCredits: 10_000 });
  });
  it('bills Opus 5 at the existing Opus 4.7 rates, including cache writes', () => {
    expect(
      tokensToCredits(AiModel.CLAUDE_OPUS_5, 1_000_000, 1_000_000),
    ).toEqual({
      inputUsedCredits: 50_000,
      outputUsedCredits: 250_000,
    });
    const cached = tokensToCredits(
      AiModel.CLAUDE_OPUS_5,
      1_000_000,
      100_000,
      800_000,
      100_000,
    );
    expect(cached).toEqual({
      inputUsedCredits: 15_250,
      outputUsedCredits: 25_000,
    });
    expect(cached).toEqual(
      tokensToCredits(
        AiModel.CLAUDE_OPUS_4_7,
        1_000_000,
        100_000,
        800_000,
        100_000,
      ),
    );
  });
  it('bills Qwen standard and cached input separately', () => {
    expect(
      tokensToCredits(AiModel.QWEN_3_8_MAX, 1_000_000, 1_000_000, 800_000),
    ).toEqual({
      inputUsedCredits: 6_000,
      outputUsedCredits: 60_000,
    });
    expect(tokensToCredits(AiModel.QWEN_3_8_MAX, 1_000_000, 0)).toEqual({
      inputUsedCredits: 20_000,
      outputUsedCredits: 0,
    });
  });
  it('bills Qwen explicit writes at 125% without charging them twice', () => {
    expect(
      tokensToCredits(AiModel.QWEN_3_8_MAX, 1_000_000, 0, 800_000, 100_000),
    ).toEqual({ inputUsedCredits: 6500, outputUsedCredits: 0 });
  });
  it('uses the Standard short-context GPT-5.6 Terra rates', () => {
    expect(tokensToCredits(AiModel.GPT_5_6_TERRA, 100_000, 100_000)).toEqual({
      inputUsedCredits: 2_000,
      outputUsedCredits: 12_000,
    });
  });

  it('rounds each Terra credit component up', () => {
    expect(tokensToCredits(AiModel.GPT_5_6_TERRA, 1, 1)).toEqual({
      inputUsedCredits: 1,
      outputUsedCredits: 1,
    });
  });

  it('uses Standard short-context GPT-5.6 Luna prices for memory extraction', () => {
    expect(tokensToCredits(AiModel.GPT_5_6_LUNA, 100_000, 100_000)).toEqual({
      inputUsedCredits: 200,
      outputUsedCredits: 1_200,
    });
  });

  it('bills cached Terra input at the cached-input rate', () => {
    expect(
      tokensToCredits(AiModel.GPT_5_6_TERRA, 1_000_000, 0, 800_000),
    ).toEqual({
      inputUsedCredits: 11_200,
      outputUsedCredits: 0,
    });
  });

  it('clamps invalid cached input to the reported input total', () => {
    expect(
      tokensToCredits(AiModel.GPT_5_6_TERRA, 1_000_000, 0, 2_000_000),
    ).toEqual({
      inputUsedCredits: 4_000,
      outputUsedCredits: 0,
    });
  });

  it('bills GPT-5.6 cache writes at the explicit-cache write rate', () => {
    expect(
      tokensToCredits(AiModel.GPT_5_6_TERRA, 1_000_000, 0, 0, 800_000),
    ).toEqual({
      inputUsedCredits: 48_000,
      outputUsedCredits: 0,
    });
  });

  it('bills the measured cached dialog usage from the provider response', () => {
    expect(
      tokensToCredits(AiModel.GPT_5_6_TERRA, 13_284, 108, 13_189, 0),
    ).toEqual({
      inputUsedCredits: 29,
      outputUsedCredits: 13,
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
      inputUsedCredits: 13_200,
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
