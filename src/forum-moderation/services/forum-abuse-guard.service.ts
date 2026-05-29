import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { createHash } from 'crypto';
import { throwError } from '../../common/utils';
import { HttpStatus } from 'src/common/utils/http-status';

type ForumTargetType = 'topic' | 'comment';

@Injectable()
export class ForumAbuseGuardService {
  constructor(@Inject('REDIS') private readonly redis: Redis) {}

  async checkOrThrow(params: {
    userId: number;
    targetType: ForumTargetType;
    title?: string | null;
    content: string;
  }): Promise<void> {
    const normalizedTitle = this.normalizeText(params.title ?? '');

    this.checkDigitsOnlyTopicTitleOrThrow({
      targetType: params.targetType,
      normalizedTitle,
    });

    const normalizedText = this.normalizeText(
      `${params.title ?? ''}\n${params.content ?? ''}`,
    );

    await this.checkCreateRateLimitOrThrow({
      userId: params.userId,
      targetType: params.targetType,
    });

    await this.checkDuplicateContentOrThrow({
      userId: params.userId,
      targetType: params.targetType,
      normalizedText,
    });
  }

  private async checkCreateRateLimitOrThrow(params: {
    userId: number;
    targetType: ForumTargetType;
  }): Promise<void> {
    const limit = params.targetType === 'topic' ? 3 : 10;
    const windowSeconds = 10 * 60;

    const key = `forum:create:${params.targetType}:user:${params.userId}`;
    const count = await this.incrementWithTtl(key, windowSeconds);

    if (count > limit) {
      throwError(
        HttpStatus.TOO_MANY_REQUESTS,
        'Forum rate limit exceeded',
        params.targetType === 'topic'
          ? 'You are creating topics too quickly. Please wait a little before posting again.'
          : 'You are posting comments too quickly. Please wait a little before posting again.',
        params.targetType === 'topic'
          ? 'FORUM_TOPIC_RATE_LIMIT_EXCEEDED'
          : 'FORUM_COMMENT_RATE_LIMIT_EXCEEDED',
      );
    }
  }

  private async checkDuplicateContentOrThrow(params: {
    userId: number;
    targetType: ForumTargetType;
    normalizedText: string;
  }): Promise<void> {
    const windowSeconds = 10 * 60;

    const contentHash = createHash('sha256')
      .update(params.normalizedText)
      .digest('hex');

    const key = `forum:duplicate:${params.targetType}:user:${params.userId}:${contentHash}`;

    const result = await this.redis.set(key, '1', 'EX', windowSeconds, 'NX');

    if (result !== 'OK') {
      throwError(
        HttpStatus.TOO_MANY_REQUESTS,
        'Duplicate forum content',
        'You already posted the same message recently.',
        'FORUM_DUPLICATE_CONTENT_RECENTLY_POSTED',
      );
    }
  }

  private checkDigitsOnlyTopicTitleOrThrow(params: {
    targetType: ForumTargetType;
    normalizedTitle: string;
  }): void {
    if (params.targetType !== 'topic') return;

    if (!/^\d+$/.test(params.normalizedTitle)) return;

    throwError(
      HttpStatus.BAD_REQUEST,
      'Forum topic title contains only digits',
      'The topic title must contain meaningful text, not only numbers.',
      'FORUM_TOPIC_TITLE_DIGITS_ONLY',
    );
  }

  private async incrementWithTtl(
    key: string,
    windowSeconds: number,
  ): Promise<number> {
    const count = await this.redis.incr(key);

    if (count === 1) {
      await this.redis.expire(key, windowSeconds);
    }

    return count;
  }

  private normalizeText(text: string): string {
    return text.toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim();
  }
}
