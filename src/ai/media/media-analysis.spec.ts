import * as mediaPolicy from './media-policy';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Repository } from 'typeorm';
import { CryptoService } from 'src/kms/crypto.service';
import { AiModel } from 'src/users/types';
import { tokensToCredits } from 'src/plans/utils/tokensToCredits';
import { MediaAnalysisService } from './media-analysis.service';
import { AiMediaAsset } from './media-asset.entity';
import { MediaProcessor, PreparedMedia } from './media-processor';
import {
  estimateMedia,
  mediaPricingCatalog,
  videoFrameTimes,
} from './media-policy';
import { openAiMediaMessages } from './media-provider-messages';
import { addExplicitPromptCacheBreakpoint } from '../utils/openai-prompt-cache';
import { buildAnthropicPromptCachePayload } from '../utils/anthropic-prompt-cache';
import { OpenAiMessage } from '../types';
import { readTranscriptionUsage } from './transcription-usage';
import { redactMediaDebug } from '../utils/ai-request-debug';

const id = '11111111-1111-4111-8111-111111111111';
function fixture(
  payload: PreparedMedia = { images: [], audioBase64: 'YXVkaW8=' },
) {
  let row = {
    id,
    userId: 7,
    hash: 'test',
    status: 'prepared',
    metadata: {
      kind: 'audio',
      durationSeconds: 60,
      hasAudio: true,
      width: 32,
      height: 32,
    },
    encryptedPayload: payload,
    usedAt: null,
  };
  const repository = {
    findOneBy: jest.fn(async (query: { id: string; userId: number }) =>
      query.id === row.id && query.userId === row.userId
        ? structuredClone(row)
        : null,
    ),
    findBy: jest.fn(async (query: { userId: number }) =>
      query.userId === row.userId ? [structuredClone(row)] : [],
    ),
    update: jest.fn(async (query: { status?: string }, update: object) => {
      if (query.status && row.status !== query.status) return { affected: 0 };
      row = { ...row, ...update };
      return { affected: 1 };
    }),
    save: jest.fn(async (value: typeof row) => {
      row = structuredClone(value);
      return value;
    }),
  };
  const crypto = {
    decryptForUser: jest.fn(async (_userId: number, value: unknown) =>
      Buffer.from(JSON.stringify(value)),
    ),
    encryptForUser: jest.fn(
      async (_userId: number, _scope: string, value: string) =>
        JSON.parse(value) as unknown,
    ),
  };
  const service = new MediaAnalysisService(
    repository as unknown as Repository<AiMediaAsset>,
    crypto as unknown as CryptoService,
    {} as MediaProcessor,
  );
  const transcriber = {
    transcribe: jest.fn(async () => ({
      text: 'Synthetic transcript',
      inputTokens: 1000,
      outputTokens: 200,
    })),
    charge: jest.fn(async () => undefined),
  };
  const messages: OpenAiMessage[] = [
    { role: 'user', content: 'Source', mediaIds: [id] },
  ];
  return { service, repository, transcriber, messages, row: () => row };
}

describe('media limits across conversation history', () => {
  function historyFixture(count: number) {
    const f = fixture({
      images: [{ base64: 'aW1hZ2U=', width: 1024, height: 768 }],
    });
    const rows = Array.from({ length: count }, (_, index) => ({
      ...f.row(),
      id: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
      status: 'ready',
    }));
    f.repository.findBy.mockResolvedValue(rows);
    const messages: OpenAiMessage[] = [];
    for (let index = 0; index < count; index += 3) {
      messages.push({
        role: 'user',
        content: index === 0 ? 'Source' : `Question ${index}`,
        mediaIds: rows.slice(index, index + 3).map((row) => row.id),
      });
      messages.push({ role: 'assistant', content: `Answer ${index}` });
    }
    return { ...f, rows, messages };
  }

  it.each([11, 41, 250])(
    'allows %i historical assets and preserves their message positions',
    async (count) => {
      const f = historyFixture(count);
      const result = await f.service.resolveMessages(
        7,
        AiModel.GPT_5_6_TERRA,
        f.messages,
        f.transcriber,
      );
      expect(result).toHaveLength(f.messages.length);
      result.forEach((message, index) => {
        expect(message.mediaIds).toEqual(f.messages[index].mediaIds);
        if (message.role === 'user') {
          expect(message.images).toHaveLength(message.mediaIds!.length);
          expect(message.content).toContain(f.messages[index].content);
        } else expect(message).toEqual(f.messages[index]);
      });
      expect(f.repository.findBy).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 7 }),
      );
      expect(f.transcriber.transcribe).not.toHaveBeenCalled();
      expect(f.transcriber.charge).not.toHaveBeenCalled();
    },
  );

  it('allows eleven attachments in one message', async () => {
    const f = historyFixture(11);
    await expect(
      f.service.resolveMessages(
        7,
        AiModel.GPT_5_6_TERRA,
        [
          {
            role: 'user',
            content: 'Source',
            mediaIds: f.rows.map((row) => row.id),
          },
        ],
        f.transcriber,
      ),
    ).resolves.toHaveLength(1);
    expect(f.transcriber.transcribe).not.toHaveBeenCalled();
    expect(f.transcriber.charge).not.toHaveBeenCalled();
  });

  it('still rejects over 250 images for Qwen before any paid work', async () => {
    const f = historyFixture(251);
    await expect(
      f.service.resolveMessages(
        7,
        AiModel.QWEN_3_8_MAX,
        f.messages,
        f.transcriber,
      ),
    ).rejects.toThrow('MEDIA_IMAGE_LIMIT');
    expect(f.transcriber.transcribe).not.toHaveBeenCalled();
    expect(f.transcriber.charge).not.toHaveBeenCalled();
  });

  it.each([
    [AiModel.QWEN_3_8_MAX, 250],
    [AiModel.GPT_5_6_TERRA, 1500],
    [AiModel.GPT_5_6_LUNA, 1500],
    [AiModel.CLAUDE_SONNET_5, 600],
    [AiModel.CLAUDE_SONNET_5_5, 600],
  ] as [AiModel, number][])(
    'uses the provider boundary for %s and preserves new media',
    async (model, maxImages) => {
      const f = historyFixture(maxImages + 1);
      const messages: OpenAiMessage[] = [
        {
          role: 'user',
          content: 'Source text stays',
          mediaIds: f.rows.slice(0, -1).map((row) => row.id),
        },
        { role: 'assistant', content: 'Earlier answer stays' },
        { role: 'user', content: 'Current', mediaIds: [f.rows[maxImages].id] },
      ];
      await expect(
        f.service.resolveMessages(7, model, messages, f.transcriber),
      ).rejects.toThrow('MEDIA_IMAGE_LIMIT');
      const result = await f.service.resolveMessages(
        7,
        model,
        messages,
        f.transcriber,
        undefined,
        { allowHistoricalOmission: true },
      );
      expect(result[0].images).toHaveLength(maxImages - 1);
      expect(result[0].content).toContain('Source text stays');
      expect(result[0].content).toContain('Visual content omitted');
      expect(result[1]).toEqual(messages[1]);
      expect(result[2].images).toHaveLength(1);
      expect(f.repository.update).not.toHaveBeenCalled();
    },
  );

  it('uses the payload budget even when image count fits, protecting the new message', async () => {
    const policy = jest.spyOn(mediaPolicy, 'mediaRequestLimits').mockReturnValue({
      maxImages: 600, maxRequestBytes: 76 * 1024, contextTokens: 1_000_000,
    });
    try {
      const f = fixture({ images: [{ base64: 'A'.repeat(8192), width: 32, height: 32 }], transcript: 'Keep this transcript' });
      const result = await f.service.resolveMessages(7, AiModel.CLAUDE_SONNET_5,
        [f.messages[0], { ...f.messages[0], content: 'Current question' }], f.transcriber, undefined,
        { allowHistoricalOmission: true });
      expect(result[0].images).toHaveLength(0);
      expect(result[0].content).toContain('Keep this transcript');
      expect(result[1].images).toHaveLength(1);
    } finally { policy.mockRestore(); }
  });

  it('rejects insufficient funds before claiming assets, transcription or charging', async () => {
    const f = fixture();
    const beforePaidWork = jest.fn(async (_estimate: unknown) => {
      throw new Error('INSUFFICIENT_AI_CREDITS');
    });
    await expect(
      f.service.resolveMessages(
        7,
        AiModel.QWEN_3_8_MAX,
        f.messages,
        f.transcriber,
        undefined,
        { allowHistoricalOmission: false, beforePaidWork },
      ),
    ).rejects.toThrow('INSUFFICIENT_AI_CREDITS');
    expect(beforePaidWork).toHaveBeenCalledWith(
      expect.objectContaining({ transcriptionCredits: 30 }),
    );
    expect(f.repository.update).not.toHaveBeenCalled();
    expect(f.transcriber.transcribe).not.toHaveBeenCalled();
    expect(f.transcriber.charge).not.toHaveBeenCalled();
  });

  it('requires ownership of every historical asset before any paid work', async () => {
    const f = historyFixture(11);
    f.repository.findBy.mockResolvedValue(f.rows.slice(0, -1));
    await expect(
      f.service.resolveMessages(
        7,
        AiModel.GPT_5_6_TERRA,
        f.messages,
        f.transcriber,
      ),
    ).rejects.toThrow('MEDIA_NOT_FOUND');
    expect(f.transcriber.transcribe).not.toHaveBeenCalled();
    expect(f.transcriber.charge).not.toHaveBeenCalled();
  });
});

describe('media pricing and preparation policy', () => {
  it('accepts five-minute video and samples the entire duration within the frame cap', () => {
    expect(mediaPricingCatalog().maxVideoSeconds).toBe(300);
    const frames = videoFrameTimes(300);
    expect(frames).toHaveLength(30);
    expect(frames.slice(0, 3)).toEqual([5, 15, 25]);
    expect(frames.slice(-3)).toEqual([275, 285, 295]);
    expect(mediaPricingCatalog().maxImagesPerRequest).toBe(40);
    expect(
      estimateMedia(AiModel.QWEN_3_8_MAX, {
        kind: 'video',
        durationSeconds: 300,
        width: 1920,
        height: 1080,
      }),
    ).toMatchObject({
      frameCount: 30,
      imageTokens: 10140,
      transcriptTokens: 1500,
      totalCredits: 383,
    });
    expect(() =>
      estimateMedia(AiModel.QWEN_3_8_MAX, {
        kind: 'video',
        durationSeconds: 301,
        width: 1920,
        height: 1080,
      }),
    ).toThrow('INVALID_MEDIA_DURATION');
  });
  it('reports owned asset status without processing or charging and hides other owners', async () => {
    const f = fixture();
    expect(await f.service.status(7, id, AiModel.QWEN_3_8_MAX)).toMatchObject({
      id,
      status: 'prepared',
      used: false,
    });
    await expect(
      f.service.status(8, id, AiModel.QWEN_3_8_MAX),
    ).rejects.toThrow();
    expect(f.transcriber.transcribe).not.toHaveBeenCalled();
    expect(f.repository.save).not.toHaveBeenCalled();
  });
  it('quotes existing video frames without rebuilding old assets after a sampling change', async () => {
    const images = Array.from({ length: 12 }, () => ({
      base64: 'aW1hZ2U=',
      width: 768,
      height: 432,
    }));
    const f = fixture({ images });
    await f.repository.update(
      {},
      {
        metadata: {
          kind: 'video',
          durationSeconds: 300,
          width: 768,
          height: 432,
          hasAudio: false,
        },
      },
    );
    const status = await f.service.status(7, id, AiModel.QWEN_3_8_MAX);
    expect(status.estimate).toMatchObject({
      frameCount: 12,
      imageTokens: 4056,
      totalCredits: 82,
    });
    expect(f.transcriber.transcribe).not.toHaveBeenCalled();
    expect(f.repository.save).not.toHaveBeenCalled();
  });
  it('allows a full thirty-frame video but rejects excess image occurrences before paid processing', async () => {
    const images = Array.from({ length: 30 }, () => ({
      base64: 'aW1hZ2U=',
      width: 768,
      height: 432,
    }));
    const f = fixture({ images, audioBase64: 'YXVkaW8=' });
    await expect(
      f.service.resolveMessages(
        7,
        AiModel.QWEN_3_8_MAX,
        Array.from({ length: 9 }, () => f.messages[0]),
        f.transcriber,
      ),
    ).rejects.toThrow('MEDIA_IMAGE_LIMIT');
    expect(f.transcriber.transcribe).not.toHaveBeenCalled();
    expect(f.transcriber.charge).not.toHaveBeenCalled();
    const result = await f.service.resolveMessages(
      7,
      AiModel.QWEN_3_8_MAX,
      f.messages,
      f.transcriber,
    );
    expect(result[0].images).toHaveLength(30);
  });
  it.each([
    [AiModel.QWEN_3_8_MAX, 770, 16],
    [AiModel.GPT_5_6_TERRA, 922, 19],
    [AiModel.GPT_5_6_LUNA, 922, 2],
    [AiModel.CLAUDE_SONNET_5, 1036, 21],
    [AiModel.CLAUDE_SONNET_5_5, 1036, 21],
  ])('estimates a 4:3 phone image for %s', (model, tokens, credits) => {
    const estimate = estimateMedia(model, {
      kind: 'image',
      width: 4032,
      height: 3024,
    });
    expect(estimate.dimensions).toEqual({ width: 1024, height: 768 });
    expect(estimate.imageTokens).toBe(tokens);
    expect(estimate.totalCredits).toBe(credits);
  });
  it('estimates video frames and optional speech, without enlargement', () => {
    const estimate = estimateMedia(AiModel.GPT_5_6_TERRA, {
      kind: 'video',
      width: 768,
      height: 576,
      durationSeconds: 60,
      hasAudio: true,
    });
    expect(estimate.frameCount).toBe(6);
    expect(estimate.transcriptionCredits).toBe(30);
    expect(estimate.imageTokens).toBe(3114);
    expect(videoFrameTimes(60)).toEqual([5, 15, 25, 35, 45, 55]);
    expect(
      estimateMedia(AiModel.GPT_5_6_TERRA, {
        kind: 'video',
        width: 320,
        height: 240,
        durationSeconds: 3,
        hasAudio: false,
      }).transcriptionCredits,
    ).toBe(0);
  });
  it('rejects invalid metadata and unsupported models instead of quoting zero', () => {
    expect(() =>
      estimateMedia(AiModel.GPT_5_6_TERRA, {
        kind: 'audio',
        durationSeconds: Infinity,
      }),
    ).toThrow();
    expect(() =>
      estimateMedia(AiModel.GPT_5_6_TERRA, {
        kind: 'image',
        width: -1,
        height: 4,
      }),
    ).toThrow();
    expect(() =>
      estimateMedia(AiModel.GPT_4_O, {
        kind: 'image',
        width: 100,
        height: 100,
      }),
    ).toThrow('MEDIA_MODEL_UNSUPPORTED');
  });
  it('exports existing authoritative rates and bills actual transcription tokens', () => {
    expect(
      mediaPricingCatalog().models.find((m) => m.model === 'gpt-5.6-terra')
        ?.inPer1M,
    ).toBe(20000);
    expect(tokensToCredits(AiModel.GPT_4O_MINI_TRANSCRIBE, 1000, 200)).toEqual({
      inputUsedCredits: 13,
      outputUsedCredits: 10,
    });
    expect(
      readTranscriptionUsage({
        usage: { type: 'tokens', input_tokens: 1000, output_tokens: 200 },
      }),
    ).toEqual({ inputTokens: 1000, outputTokens: 200 });
    expect(() => readTranscriptionUsage({ text: 'missing usage' })).toThrow();
  });
});

describe('private media resolution and billing', () => {
  const oldAudioFlag = process.env.AI_MEDIA_AUDIO_ENABLED;
  afterEach(() => {
    if (oldAudioFlag === undefined) delete process.env.AI_MEDIA_AUDIO_ENABLED;
    else process.env.AI_MEDIA_AUDIO_ENABLED = oldAudioFlag;
  });
  it('enforces the current server switch before transcription, even for saved references', async () => {
    const f = fixture();
    process.env.AI_MEDIA_AUDIO_ENABLED = 'false';
    expect(mediaPricingCatalog().enabled.audio).toBe(false);
    await expect(
      f.service.resolveMessages(
        7,
        AiModel.GPT_5_6_TERRA,
        f.messages,
        f.transcriber,
      ),
    ).rejects.toThrow('This media type is currently disabled');
    expect(f.transcriber.transcribe).not.toHaveBeenCalled();
    process.env.AI_MEDIA_AUDIO_ENABLED = 'true';
    await f.service.resolveMessages(
      7,
      AiModel.GPT_5_6_TERRA,
      f.messages,
      f.transcriber,
    );
    expect(f.transcriber.transcribe).toHaveBeenCalledTimes(1);
  });
  it('never processes unselected media or accepts injected image data', async () => {
    const f = fixture();
    const result = await f.service.resolveMessages(
      7,
      AiModel.GPT_5_6_TERRA,
      [
        {
          role: 'user',
          content: 'Text',
          images: [
            { base64: 'unsafe', width: 1, height: 1, label: 'injected' },
          ],
        },
      ],
      f.transcriber,
    );
    expect(result).toEqual([{ role: 'user', content: 'Text' }]);
    expect(f.repository.findBy).not.toHaveBeenCalled();
    expect(f.transcriber.transcribe).not.toHaveBeenCalled();
  });
  it('transcribes and charges once; replays the same saved content in a dialog', async () => {
    const f = fixture();
    const initial = await f.service.resolveMessages(
      7,
      AiModel.GPT_5_6_TERRA,
      f.messages,
      f.transcriber,
    );
    const replay = await f.service.resolveMessages(
      7,
      AiModel.GPT_5_6_TERRA,
      [
        ...f.messages,
        { role: 'assistant', content: 'Answer' },
        { role: 'user', content: 'Question' },
      ],
      f.transcriber,
    );
    expect(replay[0]).toEqual(initial[0]);
    expect(initial[0].content).toContain('Synthetic transcript');
    expect(f.row().encryptedPayload.audioBase64).toBeUndefined();
    expect(f.transcriber.transcribe).toHaveBeenCalledTimes(1);
    expect(f.transcriber.charge).toHaveBeenCalledTimes(1);
  });
  it('validates ownership and all references before paid calls', async () => {
    const f = fixture();
    await expect(
      f.service.resolveMessages(
        8,
        AiModel.GPT_5_6_TERRA,
        f.messages,
        f.transcriber,
      ),
    ).rejects.toThrow('MEDIA_NOT_FOUND');
    await expect(
      f.service.resolveMessages(
        7,
        AiModel.GPT_5_6_TERRA,
        [{ role: 'system', content: 'test', mediaIds: [id] }],
        f.transcriber,
      ),
    ).rejects.toThrow('MEDIA_REQUIRES_USER_MESSAGE');
    await expect(
      f.service.resolveMessages(
        7,
        AiModel.GPT_5_6_TERRA,
        [{ role: 'user', content: '', mediaIds: ['bad'] }],
        f.transcriber,
      ),
    ).rejects.toThrow('INVALID_MEDIA_IDS');
    expect(f.transcriber.transcribe).not.toHaveBeenCalled();
  });
  it('blocks another caller that loses the processing claim', async () => {
    const f = fixture();
    f.repository.update.mockResolvedValueOnce({ affected: 0 });
    await expect(
      f.service.resolveMessages(
        7,
        AiModel.GPT_5_6_TERRA,
        f.messages,
        f.transcriber,
      ),
    ).rejects.toThrow('MEDIA_PROCESSING');
    expect(f.transcriber.transcribe).not.toHaveBeenCalled();
  });
  it('retains usage/transcript on billing failure and does not automatically pay twice', async () => {
    const f = fixture();
    f.transcriber.charge.mockRejectedValueOnce(
      new Error('billing unavailable'),
    );
    await expect(
      f.service.resolveMessages(
        7,
        AiModel.GPT_5_6_TERRA,
        f.messages,
        f.transcriber,
      ),
    ).rejects.toThrow('billing unavailable');
    expect(f.row().status).toBe('billing_pending');
    expect(f.row().encryptedPayload.transcript).toBe('Synthetic transcript');
    await expect(
      f.service.resolveMessages(
        7,
        AiModel.GPT_5_6_TERRA,
        f.messages,
        f.transcriber,
      ),
    ).rejects.toThrow('MEDIA_PROCESSING_OR_REQUIRES_REVIEW');
    expect(f.transcriber.transcribe).toHaveBeenCalledTimes(1);
  });
  it('honors cancellation before transcription', async () => {
    const f = fixture();
    await expect(
      f.service.resolveMessages(
        7,
        AiModel.GPT_5_6_TERRA,
        f.messages,
        f.transcriber,
        AbortSignal.abort(),
      ),
    ).rejects.toThrow();
    expect(f.transcriber.transcribe).not.toHaveBeenCalled();
  });
  it('keeps photo bytes and frame labels identical during replay', async () => {
    const f = fixture({
      images: [{ base64: 'aW1hZ2U=', width: 768, height: 576, atSeconds: 5 }],
    });
    const initial = await f.service.resolveMessages(
      7,
      AiModel.QWEN_3_8_MAX,
      f.messages,
      f.transcriber,
    );
    const replay = await f.service.resolveMessages(
      7,
      AiModel.QWEN_3_8_MAX,
      f.messages,
      f.transcriber,
    );
    expect(initial).toEqual(replay);
    expect(replay[0].images?.[0].label).toBe('Attachment 1, frame at 5s');
    expect(f.transcriber.transcribe).not.toHaveBeenCalled();
  });
});

describe('multimodal provider and cache payloads', () => {
  const messages: OpenAiMessage[] = [
    { role: 'system', content: 'Shared' },
    {
      role: 'user',
      content: 'Source',
      images: [
        { base64: 'aW1hZ2U=', width: 1024, height: 768, label: 'Attachment 1' },
      ],
    },
  ];
  it('places explicit OpenAI cache boundary after the images and strips internal fields', () => {
    const result = openAiMediaMessages(
      messages,
      addExplicitPromptCacheBreakpoint(messages, 'Shared', [1]),
    );
    const blocks = result[1].content;
    expect(Array.isArray(blocks)).toBe(true);
    expect(blocks[2]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/jpeg;base64,aW1hZ2U=', detail: 'high' },
    });
    expect(blocks[3]).toEqual({
      type: 'text',
      text: '[End of attachments]',
      prompt_cache_breakpoint: { mode: 'explicit' },
    });
    expect(JSON.stringify(result)).not.toContain('"images"');
  });
  it('sends images to Qwen without adding explicit cache markers', () => {
    const result = openAiMediaMessages(messages, messages);
    expect(JSON.stringify(result)).toContain('image_url');
    expect(JSON.stringify(result)).not.toContain('prompt_cache_breakpoint');
  });
  it('sends Anthropic image blocks and places the cache marker after them', () => {
    const result = buildAnthropicPromptCachePayload(messages, 'Shared', [1]);
    expect(result.messages[0].content[2]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: 'aW1hZ2U=' },
    });
    expect(result.messages[0].content[3]).toEqual({
      type: 'text',
      text: '[End of attachments]',
      cache_control: { type: 'ephemeral', ttl: '5m' },
    });
    expect(JSON.stringify(redactMediaDebug(result))).not.toContain('aW1hZ2U=');
  });
});
