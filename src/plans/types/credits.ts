import { AiModel } from 'src/users/types';

type ModelPriceCredits = {
  inPer1M: number;
  cachedInPer1M?: number;
  cacheWriteInPer1M?: number;
  outPer1M: number;
};

export const MODEL_PRICE_CREDITS: Partial<Record<AiModel, ModelPriceCredits>> =
  {
    // Text-only image generation: $5/M text input, $30/M image output.
    // https://developers.openai.com/api/docs/models/gpt-image-2.5-flare (2026-09-23)
    [AiModel.GPT_IMAGE_2_5_FLARE]: { inPer1M: 50000, outPer1M: 300000 },
    // OpenAI transcription token usage (not duration estimates), verified 2026-09-20.
    // https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe
    [AiModel.GPT_4O_MINI_TRANSCRIBE]: { inPer1M: 12500, outPer1M: 50000 },
    // Singapore International, matching qwen-config.ts; verified 2026-09-20.
    // Automatic cache read rate; 10,000 credits per USD.
    // https://www.alibabacloud.com/help/en/model-studio/qwen3-8-max
    [AiModel.QWEN_3_8_MAX]: {
      inPer1M: 20000,
      cachedInPer1M: 2500,
      cacheWriteInPer1M: 25000,
      outPer1M: 60000,
    },
    // OpenAI Standard, short context; verified 2026-09-20.
    // https://developers.openai.com/api/docs/pricing
    [AiModel.GPT_5_6_TERRA]: {
      inPer1M: 20000,
      cachedInPer1M: 2000,
      cacheWriteInPer1M: 25000,
      outPer1M: 120000,
    },
    [AiModel.GPT_5_6_LUNA]: {
      inPer1M: 2000,
      cachedInPer1M: 200,
      cacheWriteInPer1M: 2500,
      outPer1M: 12000,
    },
    [AiModel.GPT_5_4]: {
      inPer1M: 25000,
      cachedInPer1M: 2500,
      outPer1M: 150000,
    },
    [AiModel.GPT_5_2]: { inPer1M: 17500, outPer1M: 140000 },
    [AiModel.GPT_5_1]: { inPer1M: 17500, outPer1M: 140000 },
    [AiModel.GPT_5]: { inPer1M: 12500, outPer1M: 100000 },
    [AiModel.GPT_5_MINI]: { inPer1M: 2500, outPer1M: 20000 },
    [AiModel.GPT_4_O]: { inPer1M: 25000, outPer1M: 100000 },
    [AiModel.GPT_4_1]: { inPer1M: 20000, outPer1M: 80000 },
    [AiModel.TEXT_EMBEDDING_3_SMALL]: { inPer1M: 200, outPer1M: 0 },

    [AiModel.CLAUDE_HAIKU_4_5]: {
      inPer1M: 10000,
      cachedInPer1M: 1000,
      cacheWriteInPer1M: 12500,
      outPer1M: 50000,
    },
    // Anthropic Standard / 5-minute cache; verified 2026-09-20.
    // https://platform.claude.com/docs/en/about-claude/pricing
    [AiModel.CLAUDE_SONNET_5]: {
      inPer1M: 20000,
      cachedInPer1M: 2000,
      cacheWriteInPer1M: 25000,
      outPer1M: 100000,
    },
    [AiModel.CLAUDE_SONNET_5_5]: {
      inPer1M: 20000,
      cachedInPer1M: 2000,
      cacheWriteInPer1M: 25000,
      outPer1M: 100000,
    },
    [AiModel.CLAUDE_SONNET_4_6]: {
      inPer1M: 30000,
      cachedInPer1M: 3000,
      cacheWriteInPer1M: 37500,
      outPer1M: 150000,
    },
    [AiModel.CLAUDE_OPUS_5]: {
      inPer1M: 50000,
      cachedInPer1M: 5000,
      cacheWriteInPer1M: 62500,
      outPer1M: 250000,
    },
    [AiModel.CLAUDE_OPUS_4_7]: {
      inPer1M: 50000,
      cachedInPer1M: 5000,
      cacheWriteInPer1M: 62500,
      outPer1M: 250000,
    },
    [AiModel.CLAUDE_SONNET_4_5]: {
      inPer1M: 30000,
      cachedInPer1M: 3000,
      cacheWriteInPer1M: 37500,
      outPer1M: 150000,
    },
    [AiModel.CLAUDE_OPUS_4_5]: {
      inPer1M: 50000,
      cachedInPer1M: 5000,
      cacheWriteInPer1M: 62500,
      outPer1M: 250000,
    },
  };

export function getModelPriceCredits(
  model: AiModel,
  inputTokens = 0,
): {
  inPer1M: number;
  cachedInPer1M: number;
  cacheWriteInPer1M: number;
  outPer1M: number;
} {
  const price = MODEL_PRICE_CREDITS[model];
  if (!price) throw new Error(`No pricing for model: ${model}`);

  // The whole request uses the long-context tier, including cached input.
  const longContext =
    inputTokens > 272_000 &&
    (model === AiModel.GPT_5_6_TERRA || model === AiModel.GPT_5_6_LUNA);
  const inputMultiplier = longContext ? 2 : 1;
  const outputMultiplier = longContext ? 1.5 : 1;

  return {
    inPer1M: price.inPer1M * inputMultiplier,
    cachedInPer1M: (price.cachedInPer1M ?? price.inPer1M) * inputMultiplier,
    cacheWriteInPer1M:
      (price.cacheWriteInPer1M ?? price.inPer1M) * inputMultiplier,
    outPer1M: price.outPer1M * outputMultiplier,
  };
}
