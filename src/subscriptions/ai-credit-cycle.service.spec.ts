import { describe, expect, it, jest } from '@jest/globals';
import { AiCreditCycleService } from './ai-credit-cycle.service';

describe('AiCreditCycleService', () => {
  it('claims an execution atomically with a bounded TTL and no content', async () => {
    const values = new Map<string, string>();
    const redis = {
      set: jest.fn(
        async (
          key: string,
          value: string,
          _ex: string,
          _ttl: number,
          nx: string,
        ) => {
          expect(nx).toBe('NX');
          if (values.has(key)) return null;
          values.set(key, value);
          return 'OK';
        },
      ),
    };
    const service = new AiCreditCycleService(redis as any);
    expect(await service.claimExecution(1, 'request')).toBe(true);
    expect(await service.claimExecution(1, 'request')).toBe(false);
    expect(await service.claimExecution(2, 'request')).toBe(true);
    expect(redis.set).toHaveBeenCalledWith(
      expect.any(String),
      '1',
      'EX',
      900,
      'NX',
    );
    expect([...values.values()]).toEqual(['1', '1']);
  });
  it('authorizes root and child trace ids as one short-lived cycle', async () => {
    const redis = {
      set: jest.fn(async () => 'OK'),
      get: jest.fn(async () => '1'),
      expire: jest.fn(async () => 1),
    };
    const service = new AiCreditCycleService(redis as any);

    await service.authorize(167, 'cycle-1');
    await expect(service.isAuthorized(167, 'cycle-1:embeddings')).resolves.toBe(
      true,
    );

    const authorizedKey = (redis.set as jest.Mock).mock.calls[0][0];
    const checkedKey = (redis.get as jest.Mock).mock.calls[0][0];
    expect(checkedKey).toBe(authorizedKey);
    expect(redis.set).toHaveBeenCalledWith(authorizedKey, '1', 'EX', 15 * 60);
    expect(redis.expire).toHaveBeenCalledWith(authorizedKey, 15 * 60);
  });

  it('does not authorize missing or expired cycle ids', async () => {
    const redis = {
      set: jest.fn(),
      get: jest.fn(async () => null),
      expire: jest.fn(),
    };
    const service = new AiCreditCycleService(redis as any);

    await expect(service.isAuthorized(167, '')).resolves.toBe(false);
    await expect(service.isAuthorized(167, 'cycle-2')).resolves.toBe(false);
    expect(redis.expire).not.toHaveBeenCalled();
  });
});
