import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { AiModel } from 'src/users/types';
import { EmbeddingBatchService } from './embedding-batch.service';

describe('EmbeddingBatchService', () => {
  const cache = new Map<string, string>();
  const redis = {
    get: jest.fn((key: string) => Promise.resolve(cache.get(key) ?? null)),
    set: jest.fn((key: string, value: string) => {
      cache.set(key, value);
      return Promise.resolve('OK');
    }),
  };
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'AI_EMBEDDINGS_MODEL') {
        return AiModel.TEXT_EMBEDDING_3_SMALL;
      }
      return undefined;
    }),
  };
  const provider = {
    create: jest.fn(({ inputs }: { inputs: string[] }) =>
      Promise.resolve({
        vectors: inputs.map((_, index) => [index + 1]),
        providerTokens: inputs.length,
      }),
    ),
  };
  const usage = { recordAiUsage: jest.fn(() => Promise.resolve(undefined)) };
  const tokens = {
    addTokenUserHistory: jest.fn(() => Promise.resolve(undefined)),
  };
  const reporter = { report: jest.fn() };

  const createService = () =>
    new EmbeddingBatchService(
      redis as never,
      config as never,
      provider as never,
      usage as never,
      tokens as never,
      reporter as never,
    );

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    cache.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('combines simultaneous users into one provider batch and preserves ownership', async () => {
    const service = createService();
    const first = service.generate({ userId: 11, texts: ['first'] });
    const second = service.generate({ userId: 22, texts: ['second'] });

    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(75);

    await expect(first).resolves.toMatchObject({ vectors: [[1]] });
    await expect(second).resolves.toMatchObject({ vectors: [[2]] });

    expect(provider.create).toHaveBeenCalledTimes(1);
    expect(provider.create).toHaveBeenCalledWith({
      model: AiModel.TEXT_EMBEDDING_3_SMALL,
      inputs: ['first', 'second'],
    });
    expect(usage.recordAiUsage).toHaveBeenCalledTimes(2);
    expect(usage.recordAiUsage).toHaveBeenNthCalledWith(
      1,
      11,
      AiModel.TEXT_EMBEDDING_3_SMALL,
      expect.any(Number),
      0,
    );
    expect(usage.recordAiUsage).toHaveBeenNthCalledWith(
      2,
      22,
      AiModel.TEXT_EMBEDDING_3_SMALL,
      expect.any(Number),
      0,
    );
  });

  it('returns an idempotent cached result without charging twice', async () => {
    const service = createService();
    const first = service.generate({
      userId: 11,
      texts: ['same text'],
      requestId: 'request-1',
    });

    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(75);
    const firstResult = await first;

    const secondResult = await service.generate({
      userId: 11,
      texts: ['same text'],
      requestId: 'request-2',
    });

    expect(secondResult).toEqual({ ...firstResult, cached: true });
    expect(provider.create).toHaveBeenCalledTimes(1);
    expect(usage.recordAiUsage).toHaveBeenCalledTimes(1);
    expect(tokens.addTokenUserHistory).toHaveBeenCalledTimes(1);
  });

  it('keeps the legacy texts/model request contract valid without requestId', async () => {
    const service = createService();
    const resultPromise = service.generate({
      userId: 33,
      texts: ['legacy request'],
      modelOverride: AiModel.TEXT_EMBEDDING_3_SMALL,
    });

    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(75);

    await expect(resultPromise).resolves.toEqual({
      tokens: expect.any(Number),
      vectors: [[1]],
    });
  });
});
