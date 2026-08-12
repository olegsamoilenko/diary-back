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
  }): Promise<EmbeddingBatchResponse> {
    const texts = this.cleanAndValidateTexts(params.texts);
    if (!texts.length) return { tokens: 0, vectors: [] };

    const model = this.resolveModel(params.modelOverride);
    const cacheKey = this.buildCacheKey(params.userId, model, texts);
    const existing = this.inFlightByCacheKey.get(cacheKey);
    if (existing) return existing;

    const promise = this.getCachedOrEnqueue({
      userId: params.userId,
      model,
      texts,
      cacheKey,
      requestId: params.requestId,
    }).finally(() => {
      if (this.inFlightByCacheKey.get(cacheKey) === promise) {
        this.inFlightByCacheKey.delete(cacheKey);
      }
    });

    this.inFlightByCacheKey.set(cacheKey, promise);
    return promise;
  }

  private async getCachedOrEnqueue(
    params: Omit<EmbeddingJob, 'resolve' | 'reject'>,
  ) {
    try {
      const cached = await this.redis.get(params.cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as EmbeddingBatchResponse;
        if (Array.isArray(parsed.vectors)) return { ...parsed, cached: true };
      }
    } catch (error) {
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
      this.queue.push({ ...params, resolve, reject });
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
      void this.processBatch(firstModel, jobs).finally(() => {
        this.activeBatches -= 1;
        if (this.queue.length) this.drainQueue();
      });
    }
  }

  private async processBatch(model: AiModel, jobs: EmbeddingJob[]) {
    const inputs = jobs.flatMap((job) => job.texts);

    try {
      const response = await this.provider.create({ model, inputs });
      if (response.vectors.length !== inputs.length) {
        throw new Error(
          `Embedding response length mismatch: expected ${inputs.length}, received ${response.vectors.length}`,
        );
      }

      let offset = 0;
      const results = jobs.map((job) => {
        const vectors = response.vectors.slice(
          offset,
          offset + job.texts.length,
        );
        offset += job.texts.length;
        return {
          job,
          result: {
            tokens: this.countTokens(model, job.texts),
            vectors,
          },
        };
      });

      await this.runWithConcurrency(results, 8, async ({ job, result }) => {
        try {
          await this.subscriptionUsageService.recordAiUsage(
            job.userId,
            model,
            result.tokens,
            0,
          );
          await this.tokensService.addTokenUserHistory(
            job.userId,
            TokenType.EMBEDDING,
            model,
            result.tokens,
            0,
          );

          try {
            await this.redis.set(
              job.cacheKey,
              JSON.stringify(result),
              'EX',
              this.cacheTtlSeconds,
            );
          } catch (error) {
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
        } catch (error) {
          job.reject(error);
        }
      });
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
    const encoder = encoding_for_model(model as TiktokenModel);
    try {
      return texts.reduce((sum, text) => sum + encoder.encode(text).length, 0);
    } finally {
      encoder.free();
    }
  }

  private totalChars(texts: string[]) {
    return texts.reduce((sum, text) => sum + text.length, 0);
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
