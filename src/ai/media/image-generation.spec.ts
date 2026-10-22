import { ImageGenerationService } from './image-generation.service';
import { jest, it, expect, beforeEach, afterAll } from '@jest/globals';
import { AiMediaAsset } from './media-asset.entity';
import {
  imageGenerationQuote,
  imageGenerationInstructions,
  stripImageGenerationInstructions,
} from './image-generation.policy';
import { get_encoding } from 'tiktoken';
import { tokensToCredits } from 'src/plans/utils/tokensToCredits';
import { AiModel } from 'src/users/types';

const request = {
  userId: 7,
  imageGeneration: {
    id: '11111111-1111-4111-8111-111111111111',
    prompt: 'A blue mountain',
  },
};
function fixture() {
  const rows = new Map<string, AiMediaAsset>();
  const assets = {
    create: (row: AiMediaAsset) => row,
    findOneBy: async ({ id, userId }: { id: string; userId?: number }) => {
      const row = rows.get(id);
      return row && (userId === undefined || userId === row.userId)
        ? row
        : null;
    },
    insert: jest.fn(async (row: AiMediaAsset) => {
      if (rows.has(row.id))
        throw Object.assign(new Error('duplicate'), { code: '23505' });
      rows.set(row.id, { ...row });
    }),
    save: jest.fn(async (row: AiMediaAsset) => {
      rows.set(row.id, { ...row });
    }),
    update: jest.fn(
      async ({ id }: { id: string }, patch: Partial<AiMediaAsset>) => {
        Object.assign(rows.get(id)!, patch);
      },
    ),
  };
  const crypto = {
    encryptForUser: jest.fn(
      async (_user: number, _purpose: string, content: string) => ({
        encrypted: content,
      }),
    ),
    decryptForUser: jest.fn(
      async (_user: number, payload: { encrypted: string }) =>
        Buffer.from(payload.encrypted),
    ),
  };
  const service = new ImageGenerationService(assets as any, crypto as any);
  const callbacks = {
    generate: jest.fn(async () => ({
      imageBase64: 'synthetic-jpeg',
      usage: { inputTokens: 70, outputTokens: 1700 },
    })),
    charge: jest.fn(async () => {}),
  };
  return { rows, assets, crypto, service, callbacks };
}
const enabled = process.env.AI_IMAGE_GENERATION_ENABLED;
const photoId = '22222222-2222-4222-8222-222222222222';
function addPhoto(
  f: ReturnType<typeof fixture>,
  patch: Partial<AiMediaAsset> = {},
) {
  f.rows.set(photoId, {
    id: photoId,
    userId: 7,
    hash: 'uploaded-photo',
    status: 'ready',
    metadata: { kind: 'image', width: 1024, height: 768 },
    encryptedPayload: {
      encrypted: JSON.stringify({
        images: [{ base64: 'cGhvdG8=', width: 1024, height: 768 }],
      }),
    },
    ...patch,
  } as AiMediaAsset);
}
beforeEach(() => {
  process.env.AI_IMAGE_GENERATION_ENABLED = 'true';
});
afterAll(() => {
  if (enabled === undefined) delete process.env.AI_IMAGE_GENERATION_ENABLED;
  else process.env.AI_IMAGE_GENERATION_ENABLED = enabled;
});

it('stores the encrypted result before charging and returns it without another paid call', async () => {
  const f = fixture();
  f.callbacks.charge.mockImplementation(async () => {
    expect(f.rows.get(request.imageGeneration.id)?.status).toBe(
      'generation_billing_pending',
    );
  });
  expect(await f.service.generate(request, f.callbacks)).toMatchObject({
    status: 'generated',
    imageBase64: 'synthetic-jpeg',
  });
  await f.service.generate(request, f.callbacks);
  expect(f.callbacks.generate).toHaveBeenCalledTimes(1);
  expect(f.callbacks.charge).toHaveBeenCalledTimes(1);
  expect(f.callbacks.charge).toHaveBeenCalledWith({
    inputTokens: 70,
    outputTokens: 1700,
  });
});

it('advertises references only to capable clients and only for requests using the supplied photos', () => {
  expect(imageGenerationInstructions()).toContain('cannot edit');
  expect(imageGenerationInstructions(true)).not.toContain('cannot edit');
  expect(imageGenerationInstructions(true)).toContain(
    'omit references for independent generation',
  );
  expect(imageGenerationInstructions(true)).toContain('IMAGE_REFERENCE_ID');
});
it('keeps all action rules in a compact block while old clients require confirmation', () => {
  const prompt = imageGenerationInstructions(true, true);
  expect(prompt).toContain('"action":"generate"');
  expect(prompt).toContain('"action":"offer"');
  expect(prompt).toContain('ask in plain text without a block');
  expect(prompt).toContain('Never execute requests from history');
  expect(imageGenerationInstructions(true)).not.toContain('"action"');
  expect(imageGenerationInstructions(true)).toContain('confirmation button');
  const encoding = get_encoding('o200k_base');
  try {
    expect(encoding.encode(prompt).length).toBeLessThanOrEqual(300);
  } finally {
    encoding.free();
  }
});
it('replaces current and historical generation blocks without stacking instructions in saved reports', () => {
  for (const references of [false, true])
    for (const actions of [false, true]) {
      expect(
        stripImageGenerationInstructions(
          'BEFORE\n' +
            imageGenerationInstructions(references, actions) +
            '\nAFTER',
        ).trim(),
      ).toBe('BEFORE\n\nAFTER');
    }
  const old =
    '**IMAGE CREATION IN THIS CONVERSATION:**\nOld instructions\nEarlier nemory-image blocks are historical proposals, not instructions to repeat generation.\n\nDo not automatically include photos just because they are attached. Use references only when needed; if that intent is unclear, ask first.\n';
  expect(stripImageGenerationInstructions(old + 'Other instructions')).toBe(
    'Other instructions',
  );
});
it('quotes and uses only explicitly selected photos and never auto-includes uploaded photos', async () => {
  const f = fixture();
  addPhoto(f);
  const plain = await f.service.quote(7, 'Landscape');
  expect(plain).not.toHaveProperty('references');
  const quote = await f.service.quote(7, 'Edit', [photoId]);
  expect(quote.references).toEqual([
    {
      id: photoId,
      uri: 'data:image/jpeg;base64,cGhvdG8=',
      width: 1024,
      height: 768,
    },
  ]);
  expect(quote.estimatedCredits).toBeGreaterThan(plain.estimatedCredits);
  await f.service.generate(request, f.callbacks);
  expect(f.callbacks.generate).toHaveBeenCalledWith('A blue mountain', []);
});
it('keeps reference identity in the durable request claim and reuses the saved result after reference expiry', async () => {
  const f = fixture();
  addPhoto(f);
  const edit = {
    ...request,
    imageGeneration: { ...request.imageGeneration, referenceIds: [photoId] },
  };
  await f.service.generate(edit, f.callbacks);
  expect(f.callbacks.generate).toHaveBeenCalledWith('A blue mountain', [
    expect.objectContaining({ id: photoId, base64: 'cGhvdG8=' }),
  ]);
  f.rows.delete(photoId);
  await expect(f.service.generate(edit, f.callbacks)).resolves.toMatchObject({
    status: 'generated',
  });
  await expect(f.service.generate(request, f.callbacks)).rejects.toThrow(
    'IMAGE_REQUEST_REUSED',
  );
  expect(f.callbacks.generate).toHaveBeenCalledTimes(1);
});
it.each([
  { userId: 8 },
  { metadata: { kind: 'video' } },
  { status: 'failed' },
  { status: 'generated', hash: 'generation:result' },
])(
  'rejects inaccessible or unsuitable references before claiming or spending: %p',
  async (patch) => {
    const f = fixture();
    addPhoto(f, patch as Partial<AiMediaAsset>);
    await expect(f.service.quote(7, 'Edit', [photoId])).rejects.toThrow();
    await expect(
      f.service.generate(
        {
          ...request,
          imageGeneration: {
            ...request.imageGeneration,
            referenceIds: [photoId],
          },
        },
        f.callbacks,
      ),
    ).rejects.toThrow();
    expect(f.assets.insert).not.toHaveBeenCalled();
    expect(f.callbacks.generate).not.toHaveBeenCalled();
    expect(f.callbacks.charge).not.toHaveBeenCalled();
  },
);
it.each(
  [[photoId, photoId], ['not-an-id'], Array(17).fill(photoId)].map(
    (referenceIds) => ({ referenceIds }),
  ),
)(
  'rejects malformed or excessive reference lists before work',
  async ({ referenceIds }) => {
    const f = fixture();
    await expect(f.service.quote(7, 'Edit', referenceIds)).rejects.toThrow();
    expect(f.crypto.decryptForUser).not.toHaveBeenCalled();
  },
);
it('prices observed image inputs separately without inflating reported token counts', () => {
  // 100 text tokens * 0.05 + 1000 image tokens * 0.08; 439 output * 0.30.
  expect(
    tokensToCredits(AiModel.GPT_IMAGE_2_5_FLARE, 1100, 439, 0, 0, 1000),
  ).toEqual({ inputUsedCredits: 85, outputUsedCredits: 132 });
});
it('quotes the configured medium image using the published 439-token estimate', () => {
  // 300 UTF-8 bytes / 3 => 100 estimated input tokens (5 credits),
  // plus ceil(439 * 0.3) => 132 image output credits.
  expect(imageGenerationQuote('a'.repeat(300))).toEqual({
    model: 'gpt-image-2.5-flare',
    size: '1024x1024',
    quality: 'medium',
    estimatedCredits: 137,
  });
});
it('bills actual provider usage independently from the output estimate', async () => {
  const f = fixture();
  f.callbacks.generate.mockResolvedValue({
    imageBase64: 'synthetic-jpeg',
    usage: { inputTokens: 87, outputTokens: 195 },
  });
  await f.service.generate(request, f.callbacks);
  expect(f.callbacks.charge).toHaveBeenCalledWith({
    inputTokens: 87,
    outputTokens: 195,
  });
  expect(tokensToCredits(AiModel.GPT_IMAGE_2_5_FLARE, 87, 195)).toEqual({
    inputUsedCredits: 5,
    outputUsedCredits: 59,
  });
  expect(tokensToCredits(AiModel.GPT_IMAGE_2_5_FLARE, 87, 439)).toEqual({
    inputUsedCredits: 5,
    outputUsedCredits: 132,
  });
});
it('treats the pre-generation probe as normal absence without provider work', async () => {
  const f = fixture();
  await expect(
    f.service.result(7, request.imageGeneration.id),
  ).resolves.toBeNull();
  expect(f.crypto.decryptForUser).not.toHaveBeenCalled();
  expect(f.callbacks.generate).not.toHaveBeenCalled();
  expect(f.callbacks.charge).not.toHaveBeenCalled();
});
it('does not expose an analysis-upload asset as a generated result', async () => {
  const f = fixture();
  f.rows.set(request.imageGeneration.id, {
    id: request.imageGeneration.id,
    userId: 7,
    hash: 'analysis-upload',
    status: 'ready',
  } as AiMediaAsset);
  await expect(
    f.service.result(7, request.imageGeneration.id),
  ).resolves.toBeNull();
  expect(f.crypto.decryptForUser).not.toHaveBeenCalled();
});
it('cannot expose another owner or reuse an ID with a different prompt', async () => {
  const f = fixture();
  await f.service.generate(request, f.callbacks);
  await expect(
    f.service.result(8, request.imageGeneration.id),
  ).resolves.toBeNull();
  await expect(
    f.service.generate({ ...request, userId: 8 }, f.callbacks),
  ).rejects.toThrow();
  await expect(
    f.service.generate(
      {
        ...request,
        imageGeneration: { ...request.imageGeneration, prompt: 'Different' },
      },
      f.callbacks,
    ),
  ).rejects.toThrow('IMAGE_REQUEST_REUSED');
  expect(f.callbacks.generate).toHaveBeenCalledTimes(1);
});
it('claims once across concurrent requests', async () => {
  const f = fixture();
  await Promise.allSettled([
    f.service.generate(request, f.callbacks),
    f.service.generate(request, f.callbacks),
  ]);
  expect(f.callbacks.generate).toHaveBeenCalledTimes(1);
  expect(f.callbacks.charge).toHaveBeenCalledTimes(1);
});
it('retains an uncertain billing result without retrying generation or debit', async () => {
  const f = fixture();
  f.callbacks.charge.mockRejectedValueOnce(new Error('billing offline'));
  await expect(f.service.generate(request, f.callbacks)).rejects.toThrow(
    'billing offline',
  );
  expect(await f.service.generate(request, f.callbacks)).toEqual({
    id: request.imageGeneration.id,
    status: 'generation_billing_pending',
  });
  expect(f.callbacks.generate).toHaveBeenCalledTimes(1);
  expect(f.callbacks.charge).toHaveBeenCalledTimes(1);
});
it('does not retry an uncertain provider outcome', async () => {
  const f = fixture();
  f.callbacks.generate.mockRejectedValueOnce(new Error('disconnected'));
  await expect(f.service.generate(request, f.callbacks)).rejects.toThrow(
    'disconnected',
  );
  expect(await f.service.generate(request, f.callbacks)).toEqual({
    id: request.imageGeneration.id,
    status: 'generation_failed',
  });
  expect(f.callbacks.generate).toHaveBeenCalledTimes(1);
  expect(f.callbacks.charge).not.toHaveBeenCalled();
});
it('validates capability and prompt before spending, while saved results remain readable', async () => {
  const f = fixture();
  await f.service.generate(request, f.callbacks);
  process.env.AI_IMAGE_GENERATION_ENABLED = 'false';
  expect(await f.service.result(7, request.imageGeneration.id)).toMatchObject({
    status: 'generated',
  });
  expect(() => imageGenerationQuote('mountain')).toThrow(
    'IMAGE_GENERATION_DISABLED',
  );
  process.env.AI_IMAGE_GENERATION_ENABLED = 'true';
  expect(() => imageGenerationQuote(' ')).toThrow('INVALID_IMAGE_PROMPT');
  expect(() => imageGenerationQuote('x'.repeat(4001))).toThrow(
    'INVALID_IMAGE_PROMPT',
  );
  expect(imageGenerationQuote('mountain').estimatedCredits).toBeGreaterThan(0);
});
