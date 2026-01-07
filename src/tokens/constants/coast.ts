import { AiModel } from 'src/users/types';

export const COAST_TOKEN = (
  model: AiModel,
): { input: number; output: number } => {
  switch (model) {
    case AiModel.GPT_5_2:
      return { input: 1.75, output: 14.0 };
    case AiModel.GPT_5:
      return { input: 1.25, output: 10.0 };
    case AiModel.GPT_5_MINI:
      return { input: 0.25, output: 2.0 };
    case AiModel.GPT_4_1:
      return { input: 2.0, output: 8.0 };
    case AiModel.GPT_4_O:
      return { input: 2.5, output: 10.0 };
    case AiModel.TEXT_EMBEDDING_3_SMALL:
      return { input: 0.02, output: 0 };
    case AiModel.CLAUDE_SONNET_4_5:
      return { input: 3.0, output: 15.0 };
    case AiModel.CLAUDE_OPUS_4_5:
      return { input: 5.0, output: 25.0 };
    case AiModel.CLAUDE_HAIKU_4_5:
      return { input: 1.0, output: 5.0 };
    default:
      return { input: 3.0, output: 15.0 };
  }
};
