import { AiModel } from 'src/users/types';

export enum AiProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
}

export enum AiCapability {
  CHAT = 'chat',
  MEMORY = 'memory',
  EMBEDDING = 'embedding',
}

type ModelSpec = {
  key: AiModel;
  provider: AiProvider;
  providerModelId: string;
  caps: AiCapability[];
};

export const MODEL_REGISTRY: Record<AiModel, ModelSpec> = {
  [AiModel.GPT_5_2]: {
    key: AiModel.GPT_5_2,
    provider: AiProvider.OPENAI,
    providerModelId: 'gpt-5.2',
    caps: [AiCapability.CHAT],
  },
  [AiModel.GPT_5_1]: {
    key: AiModel.GPT_5_1,
    provider: AiProvider.OPENAI,
    providerModelId: 'gpt-5.1',
    caps: [AiCapability.CHAT],
  },
  [AiModel.GPT_5]: {
    key: AiModel.GPT_5,
    provider: AiProvider.OPENAI,
    providerModelId: 'gpt-5',
    caps: [AiCapability.CHAT],
  },
  [AiModel.GPT_5_MINI]: {
    key: AiModel.GPT_5_MINI,
    provider: AiProvider.OPENAI,
    providerModelId: 'gpt-5-mini',
    caps: [AiCapability.MEMORY],
  },
  [AiModel.GPT_4_1]: {
    key: AiModel.GPT_4_1,
    provider: AiProvider.OPENAI,
    providerModelId: 'gpt-4.1',
    caps: [AiCapability.CHAT],
  },
  [AiModel.GPT_4_O]: {
    key: AiModel.GPT_4_O,
    provider: AiProvider.OPENAI,
    providerModelId: 'gpt-4o',
    caps: [AiCapability.CHAT],
  },
  [AiModel.TEXT_EMBEDDING_3_SMALL]: {
    key: AiModel.TEXT_EMBEDDING_3_SMALL,
    provider: AiProvider.OPENAI,
    providerModelId: 'text-embedding-3-small',
    caps: [AiCapability.EMBEDDING],
  },

  [AiModel.CLAUDE_SONNET_4_5]: {
    key: AiModel.CLAUDE_SONNET_4_5,
    provider: AiProvider.ANTHROPIC,
    providerModelId: 'claude-sonnet-4-5',
    caps: [AiCapability.CHAT],
  },
  [AiModel.CLAUDE_HAIKU_4_5]: {
    key: AiModel.CLAUDE_HAIKU_4_5,
    provider: AiProvider.ANTHROPIC,
    providerModelId: 'claude-haiku-4-5',
    caps: [AiCapability.CHAT],
  },
  [AiModel.CLAUDE_OPUS_4_5]: {
    key: AiModel.CLAUDE_OPUS_4_5,
    provider: AiProvider.ANTHROPIC,
    providerModelId: 'claude-opus-4-5',
    caps: [AiCapability.CHAT],
  },
};
