import { BadRequestException } from '@nestjs/common';
import { AiModel } from 'src/users/types';
import { getModelPriceCredits } from 'src/plans/types/credits';

export const MEDIA_POLICY = {
  version: 1,
  localReplayVersion: 1,
  replayRetentionDays: 7,
  photoLongEdge: 1024,
  videoLongEdge: 768,
  frameIntervalSeconds: 10,
  maxVideoFrames: 30,
  maxVideoSeconds: 300,
  maxAudioSeconds: 300,
  maxUploadBytes: 25 * 1024 * 1024,
  maxSourcePixels: 50_000_000,
  // Legacy catalog fields retained for released clients; not server request caps.
  maxAttachmentsPerRequest: 10,
  // Legacy catalog compatibility. Current clients use per-model request limits.
  maxImagesPerRequest: 40,
  maxPendingUploadsPerUser: 1500,
  transcriptTokensPerMinuteEstimate: 300,
  transcriptionCreditsPerMinuteEstimate: 30,
  transcriptionModel: AiModel.GPT_4O_MINI_TRANSCRIBE,
} as const;

// Verified 2026-09-20 against provider vision documentation. Dimensions here
// are prepared dimensions, below each model's own resizing threshold.
const IMAGE_RULES = {
  [AiModel.QWEN_3_8_MAX]: { patchSize: 32, multiplier: 1, overheadTokens: 2 },
  [AiModel.GPT_5_6_TERRA]: {
    patchSize: 32,
    multiplier: 1.2,
    overheadTokens: 0,
  },
  [AiModel.GPT_5_6_LUNA]: { patchSize: 32, multiplier: 1.2, overheadTokens: 0 },
  [AiModel.CLAUDE_SONNET_5]: {
    patchSize: 28,
    multiplier: 1,
    overheadTokens: 0,
  },
  [AiModel.CLAUDE_SONNET_5_5]: {
    patchSize: 28,
    multiplier: 1,
    overheadTokens: 0,
  },
};
export type MediaKind = 'image' | 'audio' | 'video';

// Verified 2026-09-23 for our image-block transport, not native video inputs.
// Qwen Base64: https://www.alibabacloud.com/help/en/model-studio/vision
// OpenAI Responses: https://developers.openai.com/api/docs/guides/images-vision
// Sonnet 5 (1M context): https://platform.claude.com/docs/en/build-with-claude/vision
const MODEL_MEDIA_LIMITS = {
  [AiModel.QWEN_3_8_MAX]: {
    maxImages: 250,
    maxRequestBytes: null,
    contextTokens: 1_000_000,
  },
  [AiModel.GPT_5_6_TERRA]: {
    maxImages: 1500,
    maxRequestBytes: 512 * 1024 * 1024,
    contextTokens: 1_050_000,
  },
  [AiModel.GPT_5_6_LUNA]: {
    maxImages: 1500,
    maxRequestBytes: 512 * 1024 * 1024,
    contextTokens: 1_050_000,
  },
  [AiModel.CLAUDE_SONNET_5]: {
    maxImages: 600,
    maxRequestBytes: 32 * 1024 * 1024,
    contextTokens: 1_000_000,
  },
  [AiModel.CLAUDE_SONNET_5_5]: {
    maxImages: 600,
    maxRequestBytes: 32 * 1024 * 1024,
    contextTokens: 1_000_000,
  },
} as const;

export function mediaRequestLimits(model: AiModel) {
  imageRule(model);
  return MODEL_MEDIA_LIMITS[model as keyof typeof MODEL_MEDIA_LIMITS];
}
export function mediaAnalysisFeatures(): Record<MediaKind, boolean> {
  const enabled = (key: string) => {
    const value = process.env[key];
    return value === undefined || value.trim().toLowerCase() === 'true';
  };
  return {
    image: enabled('AI_MEDIA_IMAGE_ENABLED'),
    audio: enabled('AI_MEDIA_AUDIO_ENABLED'),
    video: enabled('AI_MEDIA_VIDEO_ENABLED'),
  };
}
export function assertMediaEnabled(kind: MediaKind) {
  if (!mediaAnalysisFeatures()[kind])
    throw new BadRequestException({
      code: 'MEDIA_TYPE_DISABLED',
      kind,
      message: 'This media type is currently disabled for AI analysis.',
    });
}
export type MediaMetadata = {
  kind: MediaKind;
  width?: number;
  height?: number;
  durationSeconds?: number;
  hasAudio?: boolean;
};
export function imageRule(model: AiModel) {
  const rule = IMAGE_RULES[model as keyof typeof IMAGE_RULES];
  if (!rule) throw new BadRequestException('MEDIA_MODEL_UNSUPPORTED');
  return rule;
}
export function fitMediaImage(width: number, height: number, edge: number) {
  const scale = Math.min(1, edge / Math.max(width, height));
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}
export function videoFrameTimes(duration: number): number[] {
  const count = Math.min(
    MEDIA_POLICY.maxVideoFrames,
    Math.max(1, Math.ceil(duration / MEDIA_POLICY.frameIntervalSeconds)),
  );
  return Array.from({ length: count }, (_, i) =>
    Number((((i + 0.5) * duration) / count).toFixed(3)),
  );
}
export function mediaPricingCatalog() {
  return {
    enabled: mediaAnalysisFeatures(),
    ...MEDIA_POLICY,
    approximate: true,
    defaultSelected: false,
    excludes: ['analysis_output', 'existing_context', 'future_dialog_turns'],
    models: Object.entries(IMAGE_RULES).map(([model, image]) => ({
      model,
      image,
      requestLimits: mediaRequestLimits(model as AiModel),
      ...getModelPriceCredits(model as AiModel),
      longContextThreshold: /^gpt-5\.6-/.test(model) ? 272000 : null,
      longContextInputMultiplier: /^gpt-5\.6-/.test(model) ? 2 : 1,
    })),
  };
}
export function estimateMedia(
  model: AiModel,
  media: MediaMetadata,
  prepared?: { frameCount: number },
) {
  const rule = imageRule(model);
  if (!['image', 'audio', 'video'].includes(media.kind))
    throw new BadRequestException('INVALID_MEDIA_KIND');
  const duration = media.durationSeconds ?? 0;
  if (
    media.kind !== 'image' &&
    (!Number.isFinite(duration) ||
      duration <= 0 ||
      duration >
        (media.kind === 'video'
          ? MEDIA_POLICY.maxVideoSeconds
          : MEDIA_POLICY.maxAudioSeconds))
  )
    throw new BadRequestException('INVALID_MEDIA_DURATION');
  let imageTokens = 0;
  let dimensions: { width: number; height: number } | undefined;
  // Existing assets retain their original frames when the sampling policy changes.
  const frameCount =
    prepared?.frameCount ??
    (media.kind === 'video'
      ? videoFrameTimes(duration).length
      : media.kind === 'image'
        ? 1
        : 0);
  if (frameCount) {
    const { width = 0, height = 0 } = media;
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width <= 0 ||
      height <= 0 ||
      width * height > MEDIA_POLICY.maxSourcePixels
    )
      throw new BadRequestException('INVALID_MEDIA_DIMENSIONS');
    dimensions = fitMediaImage(
      width,
      height,
      media.kind === 'video'
        ? MEDIA_POLICY.videoLongEdge
        : MEDIA_POLICY.photoLongEdge,
    );
    imageTokens =
      frameCount *
      (Math.ceil(
        Math.ceil(dimensions.width / rule.patchSize) *
          Math.ceil(dimensions.height / rule.patchSize) *
          rule.multiplier,
      ) +
        rule.overheadTokens);
  }
  // Unknown video audio presence is estimated conservatively until probing.
  const audioSeconds =
    media.kind === 'audio' ||
    (media.kind === 'video' && media.hasAudio !== false)
      ? duration
      : 0;
  const transcriptTokens = Math.ceil(
    (audioSeconds / 60) * MEDIA_POLICY.transcriptTokensPerMinuteEstimate,
  );
  const transcriptionCredits = Math.ceil(
    (audioSeconds / 60) * MEDIA_POLICY.transcriptionCreditsPerMinuteEstimate,
  );
  const price = getModelPriceCredits(model);
  const tokens = imageTokens + transcriptTokens;
  return {
    approximate: true,
    dimensions,
    frameCount,
    imageTokens,
    transcriptTokens,
    transcriptionCredits,
    normalInputCredits: Math.ceil((tokens * price.inPer1M) / 1e6),
    cacheWriteInputCredits: Math.ceil((tokens * price.cacheWriteInPer1M) / 1e6),
    totalCredits:
      transcriptionCredits + Math.ceil((tokens * price.inPer1M) / 1e6),
  };
}
