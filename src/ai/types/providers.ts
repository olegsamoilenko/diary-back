import { AiModel } from 'src/users/types';

export enum AiProvider {
  QWEN = 'qwen',
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
}

export enum AiCapability {
  IMAGE_GENERATION = 'image_generation',
  TRANSCRIPTION = 'transcription',
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
  [AiModel.GPT_IMAGE_2_5_FLARE]: {
    key: AiModel.GPT_IMAGE_2_5_FLARE,
    provider: AiProvider.OPENAI,
    providerModelId: 'gpt-image-2.5-flare',
    caps: [AiCapability.IMAGE_GENERATION],
  },
  [AiModel.GPT_4O_MINI_TRANSCRIBE]: {
    key: AiModel.GPT_4O_MINI_TRANSCRIBE,
    provider: AiProvider.OPENAI,
    providerModelId: 'gpt-4o-mini-transcribe',
    caps: [AiCapability.TRANSCRIPTION],
  },
  [AiModel.QWEN_3_8_MAX]: {
    key: AiModel.QWEN_3_8_MAX,
    provider: AiProvider.QWEN,
    providerModelId: 'qwen3.8-max',
    caps: [AiCapability.CHAT],
  },
  [AiModel.GPT_5_6_TERRA]: {
    key: AiModel.GPT_5_6_TERRA,
    provider: AiProvider.OPENAI,
    providerModelId: 'gpt-5.6-terra',
    caps: [AiCapability.CHAT],
  },
  [AiModel.GPT_5_6_LUNA]: {
    key: AiModel.GPT_5_6_LUNA,
    provider: AiProvider.OPENAI,
    providerModelId: 'gpt-5.6-luna',
    caps: [AiCapability.CHAT],
  },
  [AiModel.GPT_5_4]: {
    key: AiModel.GPT_5_4,
    provider: AiProvider.OPENAI,
    providerModelId: 'gpt-5.4',
    caps: [AiCapability.CHAT],
  },
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

  [AiModel.CLAUDE_SONNET_5]: {
    key: AiModel.CLAUDE_SONNET_5,
    provider: AiProvider.ANTHROPIC,
    providerModelId: 'claude-sonnet-5',
    caps: [AiCapability.CHAT],
  },
  [AiModel.CLAUDE_SONNET_5_5]: {
    key: AiModel.CLAUDE_SONNET_5_5,
    provider: AiProvider.ANTHROPIC,
    providerModelId: 'claude-sonnet-5-5',
    caps: [AiCapability.CHAT],
  },
  [AiModel.CLAUDE_SONNET_4_6]: {
    key: AiModel.CLAUDE_SONNET_4_6,
    provider: AiProvider.ANTHROPIC,
    providerModelId: 'claude-sonnet-4-6',
    caps: [AiCapability.CHAT],
  },
  [AiModel.CLAUDE_HAIKU_4_5]: {
    key: AiModel.CLAUDE_HAIKU_4_5,
    provider: AiProvider.ANTHROPIC,
    providerModelId: 'claude-haiku-4-5',
    caps: [AiCapability.CHAT],
  },
  [AiModel.CLAUDE_OPUS_5]: {
    key: AiModel.CLAUDE_OPUS_5,
    provider: AiProvider.ANTHROPIC,
    providerModelId: 'claude-opus-5',
    caps: [AiCapability.CHAT],
  },
  [AiModel.CLAUDE_OPUS_4_7]: {
    key: AiModel.CLAUDE_OPUS_4_7,
    provider: AiProvider.ANTHROPIC,
    providerModelId: 'claude-opus-4-7',
    caps: [AiCapability.CHAT],
  },
  [AiModel.CLAUDE_SONNET_4_5]: {
    key: AiModel.CLAUDE_SONNET_4_5,
    provider: AiProvider.ANTHROPIC,
    providerModelId: 'claude-sonnet-4-5',
    caps: [AiCapability.CHAT],
  },
  [AiModel.CLAUDE_OPUS_4_5]: {
    key: AiModel.CLAUDE_OPUS_4_5,
    provider: AiProvider.ANTHROPIC,
    providerModelId: 'claude-opus-4-5',
    caps: [AiCapability.CHAT],
  },
};
