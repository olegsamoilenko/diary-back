import { describe, it, expect, jest } from '@jest/globals';
import { LogsService } from './logs.service';
import { Repository } from 'typeorm';
import { Log } from './entities/log.entity';
import { ServerHttpLog } from './entities/server-http-logs.entity';
import { sanitizeDiagnostic } from './sanitizeDiagnostic';

describe('NA26 server persistence privacy for old clients', () => {
  const make = () => {
    const query = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn<(value: unknown[]) => unknown>().mockReturnThis(),
      execute: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };
    const repo = { createQueryBuilder: jest.fn(() => query) };
    const http = {
      create: jest.fn((value: unknown) => value),
      save: jest
        .fn<(value: Record<string, unknown>) => Promise<{ id: string }>>()
        .mockResolvedValue({ id: '1' }),
    };
    const service = new LogsService(
      repo as unknown as Repository<Log>,
      http as unknown as Repository<ServerHttpLog>,
    );
    return { service, query, http };
  };
  it.each(['object', 'json', 'console'])(
    'sanitizes %s legacy data before DB insert',
    async (variant) => {
      const { service, query } = make();
      const error = {
        code: 'ERR_BAD_REQUEST',
        status: 400,
        config: {
          method: 'post',
          url: '/users/change-user-auth-data?token=SECRET_QUERY',
          data: JSON.stringify({
            newPassword: 'SECRET_PASSWORD',
            hash: 'SECRET_HASH',
          }),
        },
        response: { data: { userText: 'SECRET_JOURNAL' }, status: 400 },
        cause: { message: 'SECRET_CAUSE', payload: { token: 'SECRET_TOKEN' } },
      };
      const data =
        variant === 'json'
          ? JSON.stringify(error)
          : variant === 'console'
            ? { args: ['SECRET_CONSOLE', error] }
            : error;
      const before = JSON.stringify(data);
      await expect(
        service.ingestBatch(
          {
            events: [
              {
                ts: 123,
                level: 'error',
                kind: 'error',
                name: 'request_error',
                userId: 7,
                data,
                appData: { appBuild: '278' },
                device: { os: 'android' },
              },
            ],
          },
          { requestId: 'request-server' },
        ),
      ).resolves.toEqual({ inserted: 1 });
      const rows = query.values.mock.calls[0][0] as Array<
        Record<string, unknown>
      >;
      expect(JSON.stringify(rows)).not.toContain('SECRET_');
      expect(rows[0]).toMatchObject({
        userId: 7,
        requestId: 'request-server',
        appData: { appBuild: '278' },
      });
      expect(JSON.stringify(rows)).toContain('ERR_BAD_REQUEST');
      expect(JSON.stringify(data)).toBe(before);
    },
  );
  it('keeps ads metadata', async () => {
    const { service, query } = make();
    const data = {
      reason: 'no-fill',
      placement: 'calendar',
      attempt: 2,
      delayMs: 30000,
      focused: true,
    };
    await service.ingestBatch(
      {
        events: [
          {
            ts: 123,
            level: 'info',
            kind: 'app',
            name: 'ads_native_load_failed',
            data,
          },
        ],
      },
      {},
    );
    expect(
      (query.values.mock.calls[0][0][0] as Record<string, unknown>).data,
    ).toEqual(data);
  });
  it('projects server HTTP failures without echoing query, provider messages or stack text', async () => {
    const { service, http } = make();
    await service.createServerHttpFail({
      ts: 123,
      level: 'error',
      status: 500,
      method: 'POST',
      path: '/ai/extract-user-memory?text=SECRET_QUERY',
      query: { text: 'SECRET_QUERY' },
      referer: 'https://example.test/page?password=SECRET_PASSWORD',
      errorName: 'AxiosError',
      errorMessage: 'SECRET_PROVIDER_ECHO',
      stack: 'Error: SECRET_STACK\n at run (/secret/SECRET_PATH.ts:10:20)',
      meta: {
        errorCode: 'ERR_BAD_REQUEST',
        payload: { text: 'SECRET_PAYLOAD' },
      },
    });
    const saved = http.save.mock.calls[0][0];
    expect(JSON.stringify(saved)).not.toContain('SECRET_');
    expect(saved).toMatchObject({
      status: 500,
      path: '/ai/extract-user-memory',
      errorName: 'AxiosError',
      stack: 'at 10:20',
      meta: { errorCode: 'ERR_BAD_REQUEST' },
    });
  });
  it('handles native Error and hostile accessors without failing ingestion', () => {
    const error = new Error('SECRET_NATIVE');
    Object.defineProperty(error, 'config', {
      get() {
        throw Error('SECRET_ACCESSOR');
      },
    });
    Object.assign(error, { code: 'ERR_NETWORK', cause: error });
    expect(JSON.stringify(sanitizeDiagnostic(error))).not.toContain('SECRET_');
    expect(sanitizeDiagnostic(error)).toMatchObject({ code: 'ERR_NETWORK' });
  });
});
