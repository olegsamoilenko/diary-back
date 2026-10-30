import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  jest,
} from '@jest/globals';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { ForumAbuseGuardService } from './services/forum-abuse-guard.service';

// Explicit opt-in. Every key belongs to a unique prefix; never flush shared Redis.
const suite = process.env.NA47_REDIS_PORT ? describe : describe.skip;
suite('Forum admission against real Redis', () => {
  let redis: Redis;
  let guard: ForumAbuseGuardService;
  const prefix = `na47-test:${randomUUID()}:`;
  let userId = 0;
  let params: {
    userId: number;
    targetType: 'topic';
    title: string;
    content: string;
  };
  beforeAll(async () => {
    redis = new Redis({
      host: '127.0.0.1',
      port: Number(process.env.NA47_REDIS_PORT),
      keyPrefix: prefix,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      retryStrategy: () => null,
    });
    await redis.connect();
    guard = new ForumAbuseGuardService(redis);
  });
  beforeEach(() => {
    params = {
      userId: ++userId,
      targetType: 'topic',
      title: 'Meaningful title',
      content: 'Text',
    };
  });
  afterAll(async () => {
    try {
      if (redis.status !== 'ready') return;
      // KEYS returns physical keys. Strip only this run's known random prefix before DEL.
      const keys = await redis.keys(`${prefix}*`);
      for (const key of keys) {
        if (!key.startsWith(prefix)) throw new Error('Unexpected key');
        await redis.del(key.slice(prefix.length));
      }
    } finally {
      redis.disconnect();
    }
  });
  it('admits only one of twenty simultaneous identical requests and charges one slot', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => guard.checkOrThrow(params)),
    );
    const accepted = results.filter((r) => r.status === 'fulfilled');
    expect(accepted).toHaveLength(1);
    const receipt = accepted[0].value;
    expect(await redis.get(receipt.rateKey)).toBe('1');
    expect(await redis.get(receipt.key)).toBe(receipt.owner);
  });
  it('allows immediate identical retry and refunds quota after technical failure', async () => {
    for (let i = 0; i < 5; i++) {
      const receipt = await guard.checkOrThrow(params);
      await guard.finish(receipt, false);
      expect(await redis.get(receipt.rateKey)).toBe('0');
    }
    await expect(guard.checkOrThrow(params)).resolves.toBeDefined();
  });
  it('retains successful/rejected content for the original ten-minute policy', async () => {
    const receipt = await guard.checkOrThrow(params);
    await guard.finish(receipt, true);
    await expect(guard.checkOrThrow(params)).rejects.toThrow();
    expect(await redis.ttl(receipt.key)).toBeGreaterThan(595);
    expect(await redis.get(receipt.rateKey)).toBe('1');
  });
  it('retains topic rate limit and does not charge rejected attempts', async () => {
    const first = await guard.checkOrThrow(params);
    await guard.checkOrThrow({ ...params, content: 'second' });
    await guard.checkOrThrow({ ...params, content: 'third' });
    await expect(
      guard.checkOrThrow({ ...params, content: 'fourth' }),
    ).rejects.toThrow();
    expect(await redis.get(first.rateKey)).toBe('3');
    await guard.finish(first, false);
    await expect(
      guard.checkOrThrow({ ...params, content: 'fourth' }),
    ).resolves.toBeDefined();
  });
  it('retains the separate ten-comment rate limit', async () => {
    for (let i = 0; i < 10; i++)
      await guard.checkOrThrow({
        ...params,
        targetType: 'comment',
        content: `Comment ${i}`,
      });
    await expect(
      guard.checkOrThrow({
        ...params,
        targetType: 'comment',
        content: 'Comment 11',
      }),
    ).rejects.toThrow();
  });
  it('old cleanup cannot delete or renew a new owner or refund its quota', async () => {
    const old = await guard.checkOrThrow(params);
    await redis.del(old.key);
    const current = await guard.checkOrThrow(params);
    expect(await guard.renew(old)).toBe(false);
    await guard.finish(old, false);
    expect(await redis.get(current.key)).toBe(current.owner);
    expect(await redis.get(current.rateKey)).toBe('2');
  });
  it('old rate window cleanup cannot reduce a new window', async () => {
    const old = await guard.checkOrThrow(params);
    await redis.del(old.rateKey, old.windowKey);
    const current = await guard.checkOrThrow({
      ...params,
      content: 'new window',
    });
    await guard.finish(old, false);
    expect(await redis.get(current.rateKey)).toBe('1');
    expect(await redis.get(old.key)).toBeNull();
  });
  it('supports existing numeric rate counters without a migration', async () => {
    await redis.set(`forum:create:topic:user:${params.userId}`, '2', 'EX', 120);
    const receipt = await guard.checkOrThrow(params);
    expect(await redis.get(receipt.rateKey)).toBe('3');
    expect(await redis.ttl(receipt.rateKey)).toBeLessThanOrEqual(120);
    await guard.finish(receipt, false);
    expect(await redis.get(receipt.rateKey)).toBe('2');
  });
  it('renewal keeps a running attempt reserved and repeated cleanup never double-refunds', async () => {
    const receipt = await guard.checkOrThrow(params);
    await redis.expire(receipt.key, 1);
    expect(await guard.renew(receipt)).toBe(true);
    expect(await redis.ttl(receipt.key)).toBeGreaterThan(595);
    await guard.finish(receipt, false);
    await guard.finish(receipt, false);
    expect(await redis.get(receipt.rateKey)).toBe('0');
  });
});
