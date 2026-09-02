import { createHash } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { encoding_for_model, TiktokenModel } from 'tiktoken';
import { throwError } from 'src/common/utils';
import { HttpStatus } from 'src/common/utils/http-status';
import { SubscriptionUsageService } from 'src/subscriptions/subscription-usage.service';
import { TokensService } from 'src/tokens/tokens.service';
import { TokenType } from 'src/tokens/types';
import { AiModel } from 'src/users/types';
import { AiErrorReporterService } from 'src/ai-errors/ai-error-reporter.service';
import { getModelPriceCredits } from 'src/plans/types/credits';
import { tokensToCredits } from 'src/plans/utils/tokensToCredits';
import {
  rememberMemoryReviewProviderUsage,
  type MemoryReviewPromptAccounting,
} from '../memory-review-file-log';
import { logServerEntryTiming } from '../entry-flow-debug';
import { OpenAiEmbeddingProvider } from './openai-embedding.provider';

export type EmbeddingBatchResponse = {
  tokens: number;
  vectors: number[][];
  cached?: boolean;
};

type EmbeddingJob = {
  userId: number;
  model: AiModel;
  texts: string[];
  cacheKey: string;
  requestId?: string;
  timingTraceId?: string;
  startedAtMs: number;
  enqueuedAtMs?: number;
  resolve: (value: EmbeddingBatchResponse) => void;
  reject: (reason: unknown) => void;
};

const DEFAULT_BATCH_WINDOW_MS = 75;
const DEFAULT_MAX_BATCH_INPUTS = 128;
const DEFAULT_MAX_BATCH_CHARS = 400_000;
const DEFAULT_MAX_CONCURRENCY = 4;
const DEFAULT_CACHE_TTL_SECONDS = 15 * 60;
const MAX_TEXTS_PER_REQUEST = 64;
const MAX_CHARS_PER_TEXT = 20_000;
const MAX_CHARS_PER_REQUEST = 120_000;
const USER_RATE_LIMIT_WINDOW_MS = 60_000;
const USER_RATE_LIMIT_REQUESTS = 30;
const MAX_QUEUED_JOBS = 5_000;

@Injectable()
export class EmbeddingBatchService {
  private readonly queue: EmbeddingJob[] = [];
  private readonly inFlightByCacheKey = new Map<
    string,
    Promise<EmbeddingBatchResponse>
  >();
  private readonly requestTimesByUser = new Map<number, number[]>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private activeBatches = 0;

  private readonly batchWindowMs: number;
  private readonly maxBatchInputs: number;
  private readonly maxBatchChars: number;
  private readonly maxConcurrency: number;
  private readonly cacheTtlSeconds: number;

  constructor(
    @Inject('REDIS') private readonly redis: Redis,
    private readonly configService: ConfigService,
    private readonly provider: OpenAiEmbeddingProvider,
    private readonly subscriptionUsageService: SubscriptionUsageService,
    private readonly tokensService: TokensService,
    private readonly aiErrorReporter: AiErrorReporterService,
  ) {
    this.batchWindowMs = this.positiveConfig(
      'AI_EMBEDDING_BATCH_WINDOW_MS',
      DEFAULT_BATCH_WINDOW_MS,
    );
    this.maxBatchInputs = this.positiveConfig(
      'AI_EMBEDDING_MAX_BATCH_INPUTS',
      DEFAULT_MAX_BATCH_INPUTS,
    );
    this.maxBatchChars = this.positiveConfig(
      'AI_EMBEDDING_MAX_BATCH_CHARS',
      DEFAULT_MAX_BATCH_CHARS,
    );
    this.maxConcurrency = this.positiveConfig(
      'AI_EMBEDDING_MAX_CONCURRENCY',
      DEFAULT_MAX_CONCURRENCY,
    );
    this.cacheTtlSeconds = this.positiveConfig(
      'AI_EMBEDDING_CACHE_TTL_SECONDS',
      DEFAULT_CACHE_TTL_SECONDS,
    );
  }

  async generate(params: {
    userId: number;
    texts: string[];
    modelOverride?: string;
    requestId?: string;
    timingTraceId?: string;
  }): Promise<EmbeddingBatchResponse> {
    const startedAtMs = Date.now();
    const texts = this.cleanAndValidateTexts(params.texts);
    if (!texts.length) return { tokens: 0, vectors: [] };

    const model = this.resolveModel(params.modelOverride);
    this.logTiming(
      { timingTraceId: params.timingTraceId, startedAtMs },
      'EMBEDDING_REQUEST_RECEIVED',
      {
        model,
        inputs: texts.length,
        characters: this.totalChars(texts),
      },
    );
    const cacheKey = this.buildCacheKey(params.userId, model, texts);
    const existing = this.inFlightByCacheKey.get(cacheKey);
    if (existing) {
      this.logTiming(
        { timingTraceId: params.timingTraceId, startedAtMs },
        'EMBEDDING_IN_FLIGHT_REQUEST_REUSED',
      );
      const reusedResult = await existing;
      this.logTiming(
        { timingTraceId: params.timingTraceId, startedAtMs },
        'EMBEDDING_REQUEST_DONE',
        { reused: true, cached: reusedResult.cached === true },
      );
      return reusedResult;
    }

    const promise = this.getCachedOrEnqueue({
      userId: params.userId,
      model,
      texts,
      cacheKey,
      requestId: params.requestId,
      timingTraceId: params.timingTraceId,
      startedAtMs,
    }).finally(() => {
      if (this.inFlightByCacheKey.get(cacheKey) === promise) {
        this.inFlightByCacheKey.delete(cacheKey);
      }
    });

    this.inFlightByCacheKey.set(cacheKey, promise);
    try {
      const result = await promise;
      this.logTiming(
        { timingTraceId: params.timingTraceId, startedAtMs },
        'EMBEDDING_REQUEST_DONE',
        { cached: result.cached === true, vectors: result.vectors.length },
      );
      return result;
    } catch (error) {
      this.logTiming(
        { timingTraceId: params.timingTraceId, startedAtMs },
        'EMBEDDING_REQUEST_FAILED',
        { errorName: error instanceof Error ? error.name : 'UnknownError' },
      );
      throw error;
    }
  }

  private async getCachedOrEnqueue(
    params: Omit<EmbeddingJob, 'resolve' | 'reject'>,
  ) {
    const cacheReadStartedAt = Date.now();
    try {
      const cached = await this.redis.get(params.cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as EmbeddingBatchResponse;
        if (Array.isArray(parsed.vectors)) {
          this.logTiming(params, 'EMBEDDING_CACHE_READ_DONE', {
            phaseDurationMs: Date.now() - cacheReadStartedAt,
            hit: true,
          });
          return { ...parsed, cached: true };
        }
      }
      this.logTiming(params, 'EMBEDDING_CACHE_READ_DONE', {
        phaseDurationMs: Date.now() - cacheReadStartedAt,
        hit: false,
      });
    } catch (error) {
      this.logTiming(params, 'EMBEDDING_CACHE_READ_FAILED', {
        phaseDurationMs: Date.now() - cacheReadStartedAt,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      this.aiErrorReporter.report({
        operation: 'embedding_idempotency_cache_read',
        transport: 'background',
        error,
        userId: params.userId,
        model: params.model,
        requestId: params.requestId,
      });
    }

    this.checkUserRateLimit(params.userId);

    if (this.queue.length >= MAX_QUEUED_JOBS) {
      throwError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'Embedding queue is full',
        'Embedding generation is temporarily busy. Please try again.',
        'EMBEDDINGS_QUEUE_FULL',
      );
    }

    return new Promise<EmbeddingBatchResponse>((resolve, reject) => {
      const enqueuedAtMs = Date.now();
      this.queue.push({ ...params, enqueuedAtMs, resolve, reject });
      this.logTiming(params, 'EMBEDDING_ENQUEUED', {
        queueDepth: this.queue.length,
        batchWindowMs: this.batchWindowMs,
      });
      this.scheduleFlush();
    });
  }

  private scheduleFlush() {
    if (this.queue.length >= this.maxBatchInputs) {
      if (this.flushTimer) clearTimeout(this.flushTimer);
      this.flushTimer = null;
      this.drainQueue();
      return;
    }

    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.drainQueue();
    }, this.batchWindowMs);
  }

  private drainQueue() {
    while (this.activeBatches < this.maxConcurrency && this.queue.length) {
      const firstModel = this.queue[0].model;
      const jobs: EmbeddingJob[] = [];
      let inputCount = 0;
      let charCount = 0;

      for (let index = 0; index < this.queue.length; ) {
        const candidate = this.queue[index];
        if (candidate.model !== firstModel) {
          index += 1;
          continue;
        }
        if (
          jobs.length > 0 &&
          (inputCount + candidate.texts.length > this.maxBatchInputs ||
            charCount + this.totalChars(candidate.texts) > this.maxBatchChars)
        ) {
          index += 1;
          continue;
        }

        jobs.push(candidate);
        inputCount += candidate.texts.length;
        charCount += this.totalChars(candidate.texts);
        this.queue.splice(index, 1);
        if (inputCount >= this.maxBatchInputs) break;
      }

      if (!jobs.length) break;
      this.activeBatches += 1;
      for (const job of jobs) {
        this.logTiming(job, 'EMBEDDING_BATCH_DISPATCHED', {
          queueWaitMs: job.enqueuedAtMs ? Date.now() - job.enqueuedAtMs : null,
          batchJobs: jobs.length,
          batchInputs: inputCount,
          batchCharacters: charCount,
          activeBatches: this.activeBatches,
        });
      }
      void this.processBatch(firstModel, jobs).finally(() => {
        this.activeBatches -= 1;
        if (this.queue.length) this.drainQueue();
      });
    }
  }

  private async processBatch(model: AiModel, jobs: EmbeddingJob[]) {
    const inputs = jobs.flatMap((job) => job.texts);

    try {
      const providerStartedAt = Date.now();
      const response = await this.provider.create({ model, inputs });
      const providerDurationMs = Date.now() - providerStartedAt;
      for (const job of jobs) {
        this.logTiming(job, 'EMBEDDING_PROVIDER_DONE', {
          phaseDurationMs: providerDurationMs,
          batchJobs: jobs.length,
          batchInputs: inputs.length,
          providerTokens: response.providerTokens ?? null,
        });
      }
      if (response.vectors.length !== inputs.length) {
        throw new Error(
          `Embedding response length mismatch: expected ${inputs.length}, received ${response.vectors.length}`,
        );
      }

      const localJobTokenCounts = jobs.map((job) =>
        this.countTokens(model, job.texts),
      );
      const historyJobTokenCounts =
        response.providerTokens != null
          ? this.allocateTokenTotal(
              response.providerTokens,
              localJobTokenCounts,
            )
          : localJobTokenCounts;
      let offset = 0;
      const results = jobs.map((job, jobIndex) => {
        const vectors = response.vectors.slice(
          offset,
          offset + job.texts.length,
        );
        offset += job.texts.length;
        return {
          job,
          result: {
            tokens: historyJobTokenCounts[jobIndex] ?? 0,
            vectors,
          },
          localTextTokenCounts: this.countIndividualTokens(model, job.texts),
        };
      });

      await this.runWithConcurrency(
        results,
        8,
        async ({ job, result, localTextTokenCounts }) => {
          try {
            const usageWriteStartedAt = Date.now();
            await this.subscriptionUsageService.recordAiUsage(
              job.userId,
              model,
              result.tokens,
              0,
              0,
              0,
              job.timingTraceId,
            );
            this.logTiming(job, 'EMBEDDING_SUBSCRIPTION_USAGE_WRITTEN', {
              phaseDurationMs: Date.now() - usageWriteStartedAt,
              tokens: result.tokens,
            });
            const tokenHistoryStartedAt = Date.now();
            await this.tokensService.addTokenUserHistory(
              job.userId,
              TokenType.EMBEDDING,
              model,
              result.tokens,
              0,
            );
            this.logTiming(job, 'EMBEDDING_TOKEN_HISTORY_WRITTEN', {
              phaseDurationMs: Date.now() - tokenHistoryStartedAt,
              tokens: result.tokens,
            });
            this.rememberReviewUsage(
              job,
              result.tokens,
              localTextTokenCounts,
              response.providerTokens != null
                ? 'provider_usage_allocated'
                : 'o200k_estimate',
              response.providerTokens == null,
            );

            try {
              const cacheWriteStartedAt = Date.now();
              await this.redis.set(
                job.cacheKey,
                JSON.stringify(result),
                'EX',
                this.cacheTtlSeconds,
              );
              this.logTiming(job, 'EMBEDDING_CACHE_WRITE_DONE', {
                phaseDurationMs: Date.now() - cacheWriteStartedAt,
              });
            } catch (error) {
              this.logTiming(job, 'EMBEDDING_CACHE_WRITE_FAILED', {
                errorName: error instanceof Error ? error.name : 'UnknownError',
              });
              this.aiErrorReporter.report({
                operation: 'embedding_idempotency_cache_write',
                transport: 'background',
                error,
                userId: job.userId,
                model,
                requestId: job.requestId,
              });
            }

            job.resolve(result);
            this.logTiming(job, 'EMBEDDING_JOB_RESOLVED', {
              tokens: result.tokens,
              vectors: result.vectors.length,
            });
          } catch (error) {
            job.reject(error);
          }
        },
      );
    } catch (error) {
      jobs.forEach((job) => job.reject(error));
    }
  }

  private async runWithConcurrency<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>,
  ) {
    let cursor = 0;
    const runners = Array.from(
      { length: Math.min(concurrency, items.length) },
      async () => {
        while (cursor < items.length) {
          const index = cursor++;
          await worker(items[index]);
        }
      },
    );
    await Promise.all(runners);
  }

  private cleanAndValidateTexts(texts: string[]): string[] {
    if (!Array.isArray(texts) || texts.length === 0) return [];
    if (texts.length > MAX_TEXTS_PER_REQUEST) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Too many embedding texts',
        `A maximum of ${MAX_TEXTS_PER_REQUEST} texts is allowed.`,
        'EMBEDDINGS_TOO_MANY_TEXTS',
      );
    }

    const cleaned = texts.map((text) =>
      (text ?? '')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim(),
    );
    if (cleaned.every((text) => text.length === 0)) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Empty texts',
        'All texts are empty after cleaning.',
        'EMBEDDINGS_EMPTY_INPUT',
      );
    }
    if (cleaned.some((text) => text.length > MAX_CHARS_PER_TEXT)) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Embedding text is too long',
        `Each text must be at most ${MAX_CHARS_PER_TEXT} characters.`,
        'EMBEDDINGS_TEXT_TOO_LONG',
      );
    }
    const totalChars = cleaned.reduce((sum, text) => sum + text.length, 0);
    if (totalChars > MAX_CHARS_PER_REQUEST) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Embedding request is too large',
        `The request must be at most ${MAX_CHARS_PER_REQUEST} characters.`,
        'EMBEDDINGS_REQUEST_TOO_LARGE',
      );
    }

    return cleaned;
  }

  private resolveModel(modelOverride?: string): AiModel {
    const configured =
      this.configService.get<AiModel>('AI_EMBEDDINGS_MODEL') ??
      AiModel.TEXT_EMBEDDING_3_SMALL;
    const requested = modelOverride ?? String(configured);
    const supportedModel = String(AiModel.TEXT_EMBEDDING_3_SMALL);

    if (requested !== supportedModel) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Unsupported embedding model',
        'The requested embedding model is not supported.',
        'EMBEDDINGS_MODEL_NOT_SUPPORTED',
      );
    }

    return AiModel.TEXT_EMBEDDING_3_SMALL;
  }

  private buildCacheKey(userId: number, model: AiModel, texts: string[]) {
    const digest = createHash('sha256')
      .update(model)
      .update('\0')
      .update(JSON.stringify(texts))
      .digest('hex');
    return `ai:embeddings:v1:${userId}:${digest}`;
  }

  private countTokens(model: AiModel, texts: string[]) {
    return this.countIndividualTokens(model, texts).reduce(
      (sum, tokens) => sum + tokens,
      0,
    );
  }

  private countIndividualTokens(model: AiModel, texts: string[]) {
    const encoder = encoding_for_model(model as TiktokenModel);
    try {
      return texts.map((text) => encoder.encode(text).length);
    } finally {
      encoder.free();
    }
  }

  private allocateTokenTotal(total: number, weights: number[]) {
    const normalizedTotal = Math.max(0, Math.trunc(total));
    const weightTotal = weights.reduce(
      (sum, weight) => sum + Math.max(0, weight),
      0,
    );
    if (!weights.length) return [];
    if (weightTotal === 0) {
      return weights.map(
        (_, index) =>
          Math.floor(normalizedTotal / weights.length) +
          (index < normalizedTotal % weights.length ? 1 : 0),
      );
    }

    const exact = weights.map(
      (weight) => (normalizedTotal * Math.max(0, weight)) / weightTotal,
    );
    const allocated = exact.map(Math.floor);
    const remainder = normalizedTotal - allocated.reduce((a, b) => a + b, 0);
    const order = exact
      .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
      .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
    for (let index = 0; index < remainder; index += 1) {
      allocated[order[index % order.length].index] += 1;
    }
    return allocated;
  }

  private totalChars(texts: string[]) {
    return texts.reduce((sum, text) => sum + text.length, 0);
  }

  private logTiming(
    job: { timingTraceId?: string; startedAtMs: number },
    event: string,
    data?: Record<string, unknown>,
  ) {
    if (!job.timingTraceId) return;
    logServerEntryTiming({
      traceId: job.timingTraceId,
      event,
      elapsedMs: Date.now() - job.startedAtMs,
      data,
    });
  }

  private rememberReviewUsage(
    job: EmbeddingJob,
    tokens: number,
    localTextTokenCounts: number[],
    usageSource: string,
    estimated: boolean,
  ) {
    if (!job.timingTraceId) return;
    const rates = getModelPriceCredits(job.model);
    const charged = tokensToCredits(job.model, tokens, 0);
    const partsTokens = localTextTokenCounts.reduce(
      (sum, value) => sum + value,
      0,
    );
    const promptAccounting: MemoryReviewPromptAccounting = {
      source: 'backend',
      tokenizer: 'o200k_base',
      parts: job.texts.map((text, index) => ({
        label: `EMBEDDING INPUT ${index + 1}`,
        characters: text.length,
        tokens: localTextTokenCounts[index] ?? 0,
      })),
      adjustments: {
        sectionBoundaryTokens: 0,
        messageEnvelopeTokens: 0,
        providerReconciliationTokens: tokens - partsTokens,
      },
      totals: {
        partsTokens,
        serverContentTokens: partsTokens,
        serverEstimatedInputTokens: partsTokens,
        serverReconciledInputTokens: tokens,
        providerInputTokens: tokens,
        historyInputTokens: tokens,
      },
      checks: {
        partsAndAdjustmentsEqualProviderInput: true,
        providerInputEqualsHistoryInput: true,
        historyPersisted: true,
      },
    };
    rememberMemoryReviewProviderUsage({
      traceId: job.timingTraceId,
      operation: 'generate_embeddings',
      model: job.model,
      usageSource,
      estimated,
      finishReason: 'stop',
      tokensFromProvider: {
        inputTotal: tokens,
        standardInput: tokens,
        cacheReadInput: 0,
        cacheWriteInput: 0,
        output: 0,
        total: tokens,
      },
      ratesPer1MTokens: {
        standardInput: rates.inPer1M,
        cacheReadInput: rates.cachedInPer1M,
        cacheWriteInput: rates.cacheWriteInPer1M,
        output: rates.outPer1M,
      },
      creditsByFormula: {
        standardInput: Number(
          ((tokens * rates.inPer1M) / 1_000_000).toFixed(4),
        ),
        cacheReadInput: 0,
        cacheWriteInput: 0,
        output: 0,
      },
      chargedCredits: {
        input: charged.inputUsedCredits,
        output: 0,
        total: charged.inputUsedCredits,
      },
      promptAccounting,
    });
  }

  private positiveConfig(key: string, fallback: number) {
    const value = Number(this.configService.get<string>(key));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  }

  private checkUserRateLimit(userId: number) {
    const now = Date.now();
    const recent = (this.requestTimesByUser.get(userId) ?? []).filter(
      (timestamp) => now - timestamp < USER_RATE_LIMIT_WINDOW_MS,
    );

    if (recent.length >= USER_RATE_LIMIT_REQUESTS) {
      throwError(
        HttpStatus.TOO_MANY_REQUESTS,
        'Embedding rate limit exceeded',
        'Too many embedding requests. Please try again shortly.',
        'EMBEDDINGS_RATE_LIMITED',
      );
    }

    recent.push(now);
    this.requestTimesByUser.set(userId, recent);

    if (this.requestTimesByUser.size > 10_000) {
      for (const [trackedUserId, timestamps] of this.requestTimesByUser) {
        if (
          timestamps.every(
            (timestamp) => now - timestamp >= USER_RATE_LIMIT_WINDOW_MS,
          )
        ) {
          this.requestTimesByUser.delete(trackedUserId);
        }
        if (this.requestTimesByUser.size <= 10_000) break;
      }
    }
  }
}
