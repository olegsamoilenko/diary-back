import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { createHash, randomUUID } from 'crypto';
import { throwError } from '../../common/utils';
import { HttpStatus } from 'src/common/utils/http-status';

type ForumTargetType = 'topic' | 'comment';
export type ForumReservation = {
  key: string;
  owner: string;
  rateKey: string;
  windowKey: string;
  windowId: string;
  policyRejected?: boolean;
};
const WINDOW_SECONDS = 600;
// Admission, rate window and duplicate ownership must be one Redis operation.
const ADMIT = `
if redis.call('EXISTS', KEYS[1]) == 1 then return {'duplicate'} end
local count = tonumber(redis.call('GET', KEYS[2]) or '0')
if count >= tonumber(ARGV[2]) then return {'rate'} end
local ttl = redis.call('PTTL', KEYS[2])
if ttl < 1 then
  redis.call('SET', KEYS[2], 0, 'EX', ARGV[3])
  redis.call('SET', KEYS[3], ARGV[4], 'EX', ARGV[3])
  ttl = tonumber(ARGV[3]) * 1000
elseif redis.call('EXISTS', KEYS[3]) == 0 then
  redis.call('SET', KEYS[3], ARGV[4], 'PX', ttl)
end
redis.call('INCR', KEYS[2])
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
return {'allowed', redis.call('GET', KEYS[3])}
`;
const FINISH = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
if ARGV[2] == 'retain' then
  redis.call('EXPIRE', KEYS[1], ARGV[3])
else
  redis.call('DEL', KEYS[1])
  if redis.call('GET', KEYS[3]) == ARGV[4] then
    local count = tonumber(redis.call('GET', KEYS[2]) or '0')
    if count > 0 then redis.call('DECR', KEYS[2]) end
  end
end
return 1
`;

@Injectable()
export class ForumAbuseGuardService {
  constructor(@Inject('REDIS') private readonly redis: Redis) {}

  async checkOrThrow(params: {
    userId: number;
    targetType: ForumTargetType;
    title?: string | null;
    content: string;
  }): Promise<ForumReservation> {
    const normalizedTitle = this.normalizeText(params.title ?? '');

    this.checkDigitsOnlyTopicTitleOrThrow({
      targetType: params.targetType,
      normalizedTitle,
    });

    const normalizedText = this.normalizeText(
      `${params.title ?? ''}\n${params.content ?? ''}`,
    );

    const contentHash = createHash('sha256')
      .update(normalizedText)
      .digest('hex');
    const key = `forum:duplicate:${params.targetType}:user:${params.userId}:${contentHash}`;
    const rateKey = `forum:create:${params.targetType}:user:${params.userId}`;
    const windowKey = `${rateKey}:window`;
    const owner = randomUUID();
    const result = (await this.redis.eval(
      ADMIT,
      3,
      key,
      rateKey,
      windowKey,
      owner,
      params.targetType === 'topic' ? 3 : 10,
      WINDOW_SECONDS,
      randomUUID(),
    )) as string[];
    if (result[0] === 'duplicate') {
      throwError(
        HttpStatus.TOO_MANY_REQUESTS,
        'Duplicate forum content',
        'You already posted the same message recently.',
        'FORUM_DUPLICATE_CONTENT_RECENTLY_POSTED',
      );
    }
    if (result[0] === 'rate') {
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
    return { key, rateKey, windowKey, owner, windowId: result[1] };
  }

  async renew(reservation: ForumReservation): Promise<boolean> {
    const result = await this.redis.eval(
      `if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
       return redis.call('EXPIRE', KEYS[1], ARGV[2])`,
      1,
      reservation.key,
      reservation.owner,
      WINDOW_SECONDS,
    );
    return result === 1;
  }

  async finish(reservation: ForumReservation, retain: boolean): Promise<void> {
    await this.redis.eval(
      FINISH,
      3,
      reservation.key,
      reservation.rateKey,
      reservation.windowKey,
      reservation.owner,
      retain ? 'retain' : 'release',
      WINDOW_SECONDS,
      reservation.windowId,
    );
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

  private normalizeText(text: string): string {
    return text.toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim();
  }
}
