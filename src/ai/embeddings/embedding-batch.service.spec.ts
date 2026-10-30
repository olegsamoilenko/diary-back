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
  const usage = {
    recordAiUsage: jest.fn(() => Promise.resolve(undefined)),
    assertRequestAffordable: jest.fn(
      async (_userId: number, _credits: number) => {},
    ),
  };
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

  it('checks standalone indexing affordability before provider work and keeps cached reuse free', async () => {
    const service = createService();
    const request = {
      userId: 11,
      texts: ['Saved without analysis'],
      indexingOnly: true,
    };
    const result = service.generate(request);
    await jest.advanceTimersByTimeAsync(100);
    await result;
    expect(usage.assertRequestAffordable).toHaveBeenCalledWith(11, 1);
    expect(usage.recordAiUsage).toHaveBeenCalledTimes(1);
    expect(tokens.addTokenUserHistory).toHaveBeenCalledTimes(1);
    await service.generate(request);
    expect(usage.assertRequestAffordable).toHaveBeenCalledTimes(1);
    expect(provider.create).toHaveBeenCalledTimes(1);
    expect(usage.recordAiUsage).toHaveBeenCalledTimes(1);
  });

  it('does not call the provider or debit credits when the embedding is unaffordable', async () => {
    const service = createService();
    usage.assertRequestAffordable.mockRejectedValueOnce(
      new Error('insufficient credits'),
    );
    await expect(
      service.generate({ userId: 11, texts: ['text'], indexingOnly: true }),
    ).rejects.toThrow('insufficient credits');
    expect(provider.create).not.toHaveBeenCalled();
    expect(usage.recordAiUsage).not.toHaveBeenCalled();
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
      0,
      0,
      'cycle-1',
    );
    expect(usage.recordAiUsage).toHaveBeenNthCalledWith(
      2,
      22,
      AiModel.TEXT_EMBEDDING_3_SMALL,
      expect.any(Number),
      0,
      0,
      0,
      'cycle-2',
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

  it.each([undefined, 'history-failure-trace'])(
    'returns and caches paid vectors after history failure (trace: %s)',
    async (timingTraceId) => {
      const error = new Error('history unavailable');
      tokens.addTokenUserHistory.mockRejectedValueOnce(error);
      const request = { userId: 11, texts: ['paid text'], timingTraceId };
      const first = createService().generate(request);
      const checked = expect(first).resolves.toEqual({
        tokens: 1,
        vectors: [[1]],
      });
      await Promise.all([checked, jest.advanceTimersByTimeAsync(100)]);

      // A fresh service must reuse Redis, not only an in-process promise.
      const reused = await createService().generate({
        ...request,
        requestId: 'retry-request',
      });
      expect(reused).toEqual({ tokens: 1, vectors: [[1]], cached: true });
      expect(provider.create).toHaveBeenCalledTimes(1);
      expect(usage.recordAiUsage).toHaveBeenCalledTimes(1);
      expect(tokens.addTokenUserHistory).toHaveBeenCalledTimes(1);
      expect(reporter.report).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'embedding_token_history_write',
          userId: 11,
          model: AiModel.TEXT_EMBEDDING_3_SMALL,
          error,
        }),
      );
      if (timingTraceId) {
        expect(mockRememberMemoryReviewProviderUsage).toHaveBeenCalledWith(
          expect.objectContaining({
            promptAccounting: expect.objectContaining({
              checks: expect.objectContaining({ historyPersisted: false }),
            }),
          }),
        );
      }
    },
  );

  it('keeps history failure isolated within a shared batch and caches each owner separately', async () => {
    tokens.addTokenUserHistory.mockRejectedValueOnce(
      new Error('history failed'),
    );
    const service = createService();
    const firstRequest = { userId: 11, texts: ['identical text'] };
    const secondRequest = { userId: 22, texts: ['identical text'] };
    const first = service.generate(firstRequest);
    const second = service.generate(secondRequest);
    const checked = expect(Promise.all([first, second])).resolves.toEqual([
      { tokens: 1, vectors: [[1]] },
      { tokens: 1, vectors: [[2]] },
    ]);
    await Promise.all([checked, jest.advanceTimersByTimeAsync(100)]);
    const freshService = createService();
    expect(await freshService.generate(firstRequest)).toEqual({
      tokens: 1,
      vectors: [[1]],
      cached: true,
    });
    expect(await freshService.generate(secondRequest)).toEqual({
      tokens: 1,
      vectors: [[2]],
      cached: true,
    });
    expect(provider.create).toHaveBeenCalledTimes(1);
    expect(usage.recordAiUsage).toHaveBeenCalledTimes(2);
    expect(tokens.addTokenUserHistory).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(2);
    expect(reporter.report).toHaveBeenCalledTimes(1);
  });

  it('rejects a billing failure without caching an unpaid result', async () => {
    usage.recordAiUsage.mockRejectedValueOnce(new Error('billing unavailable'));
    const service = createService();
    const result = service.generate({ userId: 11, texts: ['billing failure'] });
    const checked = expect(result).rejects.toThrow('billing unavailable');
    await Promise.all([checked, jest.advanceTimersByTimeAsync(100)]);
    expect(provider.create).toHaveBeenCalledTimes(1);
    expect(usage.recordAiUsage).toHaveBeenCalledTimes(1);
    expect(tokens.addTokenUserHistory).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
    expect(cache.size).toBe(0);
    expect(mockRememberMemoryReviewProviderUsage).not.toHaveBeenCalled();
  });

  it('still delivers paid vectors if both history and cache writes fail', async () => {
    tokens.addTokenUserHistory.mockRejectedValueOnce(
      new Error('history failed'),
    );
    redis.set.mockRejectedValueOnce(new Error('cache failed'));
    const result = createService().generate({
      userId: 11,
      texts: ['paid text'],
    });
    const checked = expect(result).resolves.toEqual({
      tokens: 1,
      vectors: [[1]],
    });
    await Promise.all([checked, jest.advanceTimersByTimeAsync(100)]);
    expect(usage.recordAiUsage).toHaveBeenCalledTimes(1);
    expect(reporter.report).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'embedding_idempotency_cache_write',
      }),
    );
  });
});
