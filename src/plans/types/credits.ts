import { AiModel } from 'src/users/types';

type ModelPriceCredits = {
  inPer1M: number;
  cachedInPer1M?: number;
  cacheWriteInPer1M?: number;
  outPer1M: number;
};

export const MODEL_PRICE_CREDITS: Partial<Record<AiModel, ModelPriceCredits>> =
  {
    [AiModel.GPT_5_6_TERRA]: {
      inPer1M: 30000,
      cachedInPer1M: 3000,
      cacheWriteInPer1M: 37500,
      outPer1M: 150000,
    },
    [AiModel.GPT_5_6_LUNA]: {
      inPer1M: 3000,
      cachedInPer1M: 300,
      cacheWriteInPer1M: 3750,
      outPer1M: 15000,
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
    [AiModel.CLAUDE_SONNET_4_6]: {
      inPer1M: 30000,
      cachedInPer1M: 3000,
      cacheWriteInPer1M: 37500,
      outPer1M: 150000,
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

export function getModelPriceCredits(model: AiModel): {
  inPer1M: number;
  cachedInPer1M: number;
  cacheWriteInPer1M: number;
  outPer1M: number;
} {
  const price = MODEL_PRICE_CREDITS[model];
  if (!price) throw new Error(`No pricing for model: ${model}`);

  return {
    inPer1M: price.inPer1M,
    cachedInPer1M: price.cachedInPer1M ?? price.inPer1M,
    cacheWriteInPer1M: price.cacheWriteInPer1M ?? price.inPer1M,
    outPer1M: price.outPer1M,
  };
}
