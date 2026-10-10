import { MediaAnalysisService } from './media-analysis.service';
import { it, expect, jest } from '@jest/globals';
import { AiModel } from 'src/users/types';
import { Repository } from 'typeorm';
import { AiMediaAsset } from './media-asset.entity';
import { CryptoService } from 'src/kms/crypto.service';
import { MediaProcessor } from './media-processor';

const id = '11111111-1111-4111-8111-111111111111';
const model = AiModel.GPT_5_6_TERRA;
function setup() {
  const payload = {
    images: [{ base64: 'aW1hZ2U=', width: 32, height: 32 }],
    transcript: 'Already paid speech',
  };
  const initial = {
    id,
    userId: 7,
    hash: 'source-hash',
    metadata: {
      kind: 'video',
      width: 32,
      height: 32,
      durationSeconds: 12,
      hasAudio: true,
    },
    status: 'ready',
    usedAt: new Date(),
    createdAt: new Date('2026-10-01T12:00:00Z'),
    expiresAt: null,
    encryptedPayload: { value: payload },
  };
  const rows = new Map<string, any>([[id, initial]]);
  const repository = {
    findOneBy: jest.fn(async (q: { id: string; userId?: number }) => {
      const row = rows.get(q.id);
      return row && (!q.userId || q.userId === row.userId) ? row : null;
    }),
    findBy: jest.fn(async (q: { userId: number }) =>
      [...rows.values()].filter((row) => row.userId === q.userId),
    ),
    create: (row: any) => ({ ...row, createdAt: new Date(), expiresAt: null }),
    insert: jest.fn(async (row: any) => {
      rows.set(row.id, row);
    }),
    update: jest.fn(async (q: { id: string }, patch: object) => {
      Object.assign(rows.get(q.id), patch);
      return { affected: 1 };
    }),
    delete: jest.fn(async (_criteria: any) => ({ affected: 1 })),
  };
  // Opaque sealed values stand in for authenticated encryption/KMS; only values
  // issued by this server can be decrypted, and they are bound to an owner.
  const sealed = new Map<string, { owner: number; plaintext: string }>();
  const crypto = {
    encryptForUser: jest.fn(
      async (owner: number, scope: string, plaintext: string) => {
        if (scope === 'ai_media') return { value: JSON.parse(plaintext) };
        const token = `sealed-${sealed.size}`;
        sealed.set(token, { owner, plaintext });
        return {
          token,
          aad: Buffer.from(
            JSON.stringify({ scope, uid: String(owner) }),
          ).toString('base64'),
        };
      },
    ),
    decryptForUser: jest.fn(
      async (owner: number, blob: { value?: unknown; token: string }) => {
        if (blob.value) return Buffer.from(JSON.stringify(blob.value));
        const value = sealed.get(blob.token);
        if (!value || value.owner !== owner)
          throw new Error('Authentication failed');
        return Buffer.from(value.plaintext);
      },
    ),
  };
  const service = new MediaAnalysisService(
    repository as unknown as Repository<AiMediaAsset>,
    crypto as unknown as CryptoService,
    {} as MediaProcessor,
  );
  return { service, repository, rows, initial, payload };
}

it('exports, expires and restores the same media ID without paid transcription', async () => {
  const f = setup();
  const capsule = await f.service.exportReplay(7, id);
  await f.service.acknowledgeReplay(7, id);
  expect(f.initial.expiresAt).toEqual(new Date('2026-10-08T12:00:00Z'));
  f.rows.delete(id);
  await f.service.restoreReplay(
    7,
    id,
    model,
    Buffer.from(JSON.stringify(capsule)),
  );
  const transcriber = {
    transcribe: jest.fn(async () => ({
      text: 'unexpected',
      inputTokens: 1,
      outputTokens: 1,
    })),
    charge: jest.fn(async () => {}),
  };
  const messages = await f.service.resolveMessages(
    7,
    model,
    [{ role: 'user', content: 'Continue', mediaIds: [id] }],
    transcriber,
  );
  expect(messages[0].images).toEqual([
    expect.objectContaining(f.payload.images[0]),
  ]);
  expect(messages[0].content).toContain('Already paid speech');
  expect(transcriber.transcribe).not.toHaveBeenCalled();
  expect(transcriber.charge).not.toHaveBeenCalled();
  await f.service.restoreReplay(
    7,
    id,
    model,
    Buffer.from(JSON.stringify(capsule)),
  );
  expect(f.repository.insert).toHaveBeenCalledTimes(1);
});

it('rejects another owner, another ID and untrusted client transcripts', async () => {
  const f = setup();
  const capsule = Buffer.from(
    JSON.stringify(await f.service.exportReplay(7, id)),
  );
  f.rows.clear();
  await expect(f.service.restoreReplay(8, id, model, capsule)).rejects.toThrow(
    'MEDIA_REPLAY_INVALID',
  );
  await expect(
    f.service.restoreReplay(
      7,
      '22222222-2222-4222-8222-222222222222',
      model,
      capsule,
    ),
  ).rejects.toThrow('MEDIA_REPLAY_INVALID');
  await expect(
    f.service.restoreReplay(7, id, model, Buffer.from('{"token":"tampered"}')),
  ).rejects.toThrow('MEDIA_REPLAY_INVALID');
  expect(f.repository.insert).not.toHaveBeenCalled();
});

it.each(['prepared', 'transcribing', 'billing_pending', 'failed', 'generated'])(
  'never exports or acknowledges %s work',
  async (status) => {
    const f = setup();
    f.initial.status = status;
    await expect(f.service.exportReplay(7, id)).rejects.toThrow(
      'MEDIA_REPLAY_NOT_READY',
    );
    await expect(f.service.acknowledgeReplay(7, id)).rejects.toThrow(
      'MEDIA_REPLAY_NOT_READY',
    );
    expect(f.repository.update).not.toHaveBeenCalled();
  },
);

it('keeps legacy and generated assets outside the seven-day purge predicate', async () => {
  const f = setup();
  await f.service.cleanUnused();
  const criteria = f.repository.delete.mock.calls.map((call) => call[0]);
  expect(criteria).toHaveLength(2);
  expect(criteria[0].status).toBe('prepared');
  expect(criteria[1].status).toBe('ready');
  expect(criteria[1].expiresAt.type).toBe('lessThan');
  expect(Object.keys(criteria[1]).sort()).toEqual(['expiresAt', 'status']);
});
