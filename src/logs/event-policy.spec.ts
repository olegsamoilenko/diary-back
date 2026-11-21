import { describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { format } from 'prettier';
import { shouldSendEvent } from './event-policy';
import { LogsService } from './logs.service';
import type { Repository } from 'typeorm';
import type { Log } from './entities/log.entity';
import type { ServerHttpLog } from './entities/server-http-logs.entity';

describe('diagnostic event policy', () => {
  it('keeps the frontend and backend allowlists identical', async () => {
    const front = readFileSync(
      join(__dirname, '../../../diary-front/logging/eventPolicy.ts'),
      'utf8',
    );
    const back = readFileSync(join(__dirname, 'event-policy.ts'), 'utf8');
    const options = { parser: 'typescript', endOfLine: 'lf' } as const;
    const [frontPolicy, backPolicy] = await Promise.all([
      format(front, options),
      format(back, options),
    ]);
    expect(frontPolicy).toBe(backPolicy);
  });
  it('retains arbitrary failures and only explicit lifecycle/onboarding info', () => {
    expect(shouldSendEvent('unknown_failure', 'error')).toBe(true);
    expect(shouldSendEvent('loader_slow', 'warn')).toBe(true);
    expect(shouldSendEvent('onboarding_story_2_viewed', 'info')).toBe(true);
    expect(shouldSendEvent('query_cache_event', 'info')).toBe(false);
  });
  it('does not write empty/noisy legacy batches and preserves session IDs on allowed events', async () => {
    const query = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      execute: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };
    const repo = { createQueryBuilder: jest.fn(() => query) };
    const service = new LogsService(
      repo as unknown as Repository<Log>,
      {} as Repository<ServerHttpLog>,
    );
    const event = {
      ts: 123,
      name: 'request_success',
      level: 'info' as const,
      kind: 'app' as const,
      sessionId: 'session-before-sign-in',
    };
    expect(await service.ingestBatch({ events: [] }, {})).toEqual({
      inserted: 0,
    });
    expect(await service.ingestBatch({ events: [event] }, {})).toEqual({
      inserted: 0,
    });
    expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    expect(
      await service.ingestBatch(
        {
          events: [
            { ...event, name: 'app_start' },
            { ...event, name: 'save_failed', level: 'error' },
          ],
        },
        {},
      ),
    ).toEqual({ inserted: 2 });
    expect(query.values).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'app_start',
          sessionId: 'session-before-sign-in',
        }),
        expect.objectContaining({ name: 'save_failed', level: 'error' }),
      ]),
    );
  });
});
