import { AiModel } from 'src/users/types';

type ModelPriceCredits = {
  inPer1M: number;
  outPer1M: number;
};

export const MODEL_PRICE_CREDITS: Record<
  Partial<AiModel>,
  ModelPriceCredits
> = {
  [AiModel.GPT_5_2]: { inPer1M: 17500, outPer1M: 140000 },
  [AiModel.GPT_5]: { inPer1M: 12500, outPer1M: 100000 },
  [AiModel.GPT_5_MINI]: { inPer1M: 2500, outPer1M: 20000 },
  [AiModel.GPT_4_O]: { inPer1M: 25000, outPer1M: 100000 },
  [AiModel.GPT_4_1]: { inPer1M: 20000, outPer1M: 80000 },
  [AiModel.TEXT_EMBEDDING_3_SMALL]: { inPer1M: 200, outPer1M: 0 },

  [AiModel.CLAUDE_HAIKU_4_5]: { inPer1M: 10000, outPer1M: 50000 },
  [AiModel.CLAUDE_SONNET_4_5]: { inPer1M: 30000, outPer1M: 150000 },
  [AiModel.CLAUDE_OPUS_4_5]: { inPer1M: 50000, outPer1M: 250000 },
};
