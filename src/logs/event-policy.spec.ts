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

  it('retains owner-bearing 284 open signals without attributing an earlier anonymous start', async () => {
    const values = jest.fn().mockReturnThis();
    const query = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values,
      execute: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };
    const service = new LogsService(
      { createQueryBuilder: () => query } as unknown as Repository<Log>,
      {} as Repository<ServerHttpLog>,
    );
    const base = {
      level: 'info' as const,
      ts: 1750000000000,
      sessionId: 'same-session',
      appData: { appBuild: '284' },
      userId: 87,
    };
    const active = {
      ...base,
      name: 'app_state_change',
      kind: 'app' as const,
      data: { state: 'active' },
    };
    const data = {
      method: 'POST',
      url: '/users/me',
      _origin: { component: '_Layout' },
    };
    const sync = {
      ...base,
      name: 'request_success',
      kind: 'perf' as const,
      data,
    };
    const uuid = '96c94037-e98d-430c-a4f8-58307584cad9';
    await expect(
      service.ingestBatch(
        {
          events: [
            { ...base, kind: 'app', name: 'app_start', userId: null },
            active,
            sync,
            {
              ...sync,
              userId: null,
              userUuid: uuid,
              data: { ...data, url: '/subscriptions/bootstrap' },
            },
            { ...active, data: { state: 'background' } },
            { ...active, userId: null },
            { ...active, appData: { appBuild: '288' } },
            { ...sync, data: { ...data, method: 'GET' } },
            { ...sync, data: { ...data, url: '/other' } },
            { ...sync, data: { ...data, _origin: { component: 'Settings' } } },
          ],
        },
        {},
      ),
    ).resolves.toEqual({ inserted: 4 });
    expect(values).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'app_start',
        userId: null,
        userUuid: null,
      }),
      expect.objectContaining({
        name: 'app_state_change',
        userId: 87,
        data: { state: 'active' },
      }),
      expect.objectContaining({ name: 'request_success', userId: 87, data }),
      expect.objectContaining({
        name: 'request_success',
        userUuid: uuid,
        data: { ...data, url: '/subscriptions/bootstrap' },
      }),
    ]);
  });
});
