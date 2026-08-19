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

const mockRememberMemoryReviewProviderUsage = jest.fn();

jest.mock('../memory-review-file-log', () => ({
  rememberMemoryReviewProviderUsage: (usage: Record<string, unknown>) =>
    mockRememberMemoryReviewProviderUsage(usage),
}));

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
    const first = service.generate({
      userId: 11,
      texts: ['first'],
      timingTraceId: 'cycle-1',
    });
    const second = service.generate({
      userId: 22,
      texts: ['second'],
      timingTraceId: 'cycle-2',
    });

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
    expect(mockRememberMemoryReviewProviderUsage).toHaveBeenCalledTimes(2);
    expect(mockRememberMemoryReviewProviderUsage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        traceId: 'cycle-1',
        operation: 'generate_embeddings',
        model: AiModel.TEXT_EMBEDDING_3_SMALL,
        usageSource: 'provider_usage_allocated',
        promptAccounting: expect.objectContaining({
          totals: expect.objectContaining({
            providerInputTokens: 1,
            historyInputTokens: 1,
            serverReconciledInputTokens: 1,
          }),
          checks: {
            partsAndAdjustmentsEqualProviderInput: true,
            providerInputEqualsHistoryInput: true,
            historyPersisted: true,
          },
        }),
      }),
    );
    expect(mockRememberMemoryReviewProviderUsage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        traceId: 'cycle-2',
        operation: 'generate_embeddings',
      }),
    );
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

  it('allocates the provider total exactly across histories and review logs', async () => {
    provider.create.mockResolvedValueOnce({
      vectors: [[1], [2]],
      providerTokens: 7,
    });
    const service = createService();
    const first = service.generate({
      userId: 11,
      texts: ['one'],
      timingTraceId: 'allocated-1',
    });
    const second = service.generate({
      userId: 22,
      texts: ['a substantially longer embedding input'],
      timingTraceId: 'allocated-2',
    });

    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(75);
    await Promise.all([first, second]);

    const historyCalls = tokens.addTokenUserHistory.mock
      .calls as unknown as unknown[][];
    const historyTotal = historyCalls.reduce(
      (sum, call) => sum + Number(call[3]),
      0,
    );
    const reviewTotal = mockRememberMemoryReviewProviderUsage.mock.calls.reduce(
      (sum, [call]) =>
        sum +
        Number(
          (call as { tokensFromProvider: { inputTotal: number } })
            .tokensFromProvider.inputTotal,
        ),
      0,
    );

    expect(historyTotal).toBe(7);
    expect(reviewTotal).toBe(7);
  });

  it('returns an idempotent cached result without charging twice', async () => {
    const service = createService();
    const first = service.generate({
      userId: 11,
      texts: ['same text'],
      requestId: 'request-1',
      timingTraceId: 'cached-cycle',
    });

    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(75);
    const firstResult = await first;

    const secondResult = await service.generate({
      userId: 11,
      texts: ['same text'],
      requestId: 'request-2',
      timingTraceId: 'cached-cycle',
    });

    expect(secondResult).toEqual({ ...firstResult, cached: true });
    expect(provider.create).toHaveBeenCalledTimes(1);
    expect(usage.recordAiUsage).toHaveBeenCalledTimes(1);
    expect(tokens.addTokenUserHistory).toHaveBeenCalledTimes(1);
    expect(mockRememberMemoryReviewProviderUsage).toHaveBeenCalledTimes(1);
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
