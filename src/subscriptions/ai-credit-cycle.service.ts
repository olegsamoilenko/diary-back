import { createHash } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

const AI_CREDIT_CYCLE_TTL_SECONDS = 15 * 60;

@Injectable()
export class AiCreditCycleService {
  constructor(@Inject('REDIS') private readonly redis: Redis) {}

  async authorize(userId: number, cycleId?: string | null): Promise<void> {
    const key = this.buildKey(userId, cycleId);
    if (!key) return;

    await this.redis.set(key, '1', 'EX', AI_CREDIT_CYCLE_TTL_SECONDS);
  }

  async isAuthorized(
    userId: number,
    cycleId?: string | null,
  ): Promise<boolean> {
    const key = this.buildKey(userId, cycleId);
    if (!key) return false;

    const exists = await this.redis.get(key);
    if (!exists) return false;

    await this.redis.expire(key, AI_CREDIT_CYCLE_TTL_SECONDS);
    return true;
  }

  private buildKey(userId: number, cycleId?: string | null): string | null {
    const normalizedCycleId = this.normalizeCycleId(cycleId);
    if (!normalizedCycleId) return null;

    const digest = createHash('sha256').update(normalizedCycleId).digest('hex');
    return `ai-credit-cycle:${userId}:${digest}`;
  }

  private normalizeCycleId(cycleId?: string | null): string | null {
    if (typeof cycleId !== 'string') return null;
    const normalized = cycleId.trim().replace(/:(embeddings|tags)$/, '');
    if (!normalized || normalized.length > 200) return null;
    return normalized;
  }
}
