import { describe, it, expect, jest } from '@jest/globals';
import { LogsService } from './logs.service';
import { Repository } from 'typeorm';
import { Log } from './entities/log.entity';
import { ServerHttpLog } from './entities/server-http-logs.entity';
import { sanitizeDiagnostic } from './sanitizeDiagnostic';

describe('NA26 server persistence privacy for old clients', () => {
  it('retains fixed planner UI explanation and nested known exception codes', () => {
    const message =
      'Не всі дії вдалося завершити. Перевір Планери перед повторною спробою.';
    const raw = {
      message,
      args: [
        message,
        {
          error: { message: 'PLANNER_SAVE_FAILED' },
          code: 'PLANNER_SAVE_FAILED',
          stage: 'create_item',
          savedCount: 0,
          ui: { code: 'plannerCreation.error' },
        },
      ],
    };
    expect(sanitizeDiagnostic(sanitizeDiagnostic(raw))).toEqual(raw);
    expect(sanitizeDiagnostic({ message: message + ' new details' })).toEqual({
      message: message + ' new details',
    });
  });
  it('keeps known technical explanations and call sites without accepting private exception text', () => {
    const data = {
      args: [
        'getCommunityUnreadSummary failed',
        {
          name: 'ConditionError',
          message: 'Aborted due to condition callback returning false.',
          function: 'getCommunityUnreadSummary',
          component: '_Layout',
          data: { entryText: 'SECRET_JOURNAL' },
        },
      ],
    };
    expect(sanitizeDiagnostic(sanitizeDiagnostic(data))).toEqual({
      args: [
        'getCommunityUnreadSummary failed',
        {
          name: 'ConditionError',
          message: 'Aborted due to condition callback returning false.',
          function: 'getCommunityUnreadSummary',
          component: '_Layout',
          data: { entryText: '[omitted]' },
        },
      ],
    });
    expect(
      sanitizeDiagnostic({ message: 'Network Error token=SECRET_TOKEN' }),
    ).toEqual({ message: 'Network Error token=SECRET_TOKEN' });
  });
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
  it.each(['REQUIRED_TIME', 'REMINDER_DAYS_REQUIRE_WEEKLY'])(
    'persists rejection %s in regular logs without model content',
    async (code) => {
      const { service, query } = make();
      const path =
        '/plannerCreations/0/habit/reminder/' +
        (code === 'REQUIRED_TIME' ? 'time' : 'daysOfWeek');
      await service.ingestBatch(
        {
          events: [
            {
              ts: 123,
              level: 'error',
              kind: 'error',
              name: 'planner_creation_rejected',
              data: {
                message: 'plannerCreation.error',
                stage: 'extract_validate',
                backend: {
                  requestId: 'test-trace',
                  reason: 'VALIDATION_REJECTED',
                  acceptedCount: 0,
                  issues: [{ path, code }],
                },
              },
            },
          ],
        },
        { requestId: 'log-batch' },
      );
      const rows = query.values.mock.calls[0][0] as Array<
        Record<string, unknown>
      >;
      expect(rows[0].data).toMatchObject({
        message: 'plannerCreation.error',
        stage: 'extract_validate',
        backend: { issues: [{ path, code }] },
      });
    },
  );
  it('persists readable console labels and fallback positions, without raw runtime text', async () => {
    const { service, query } = make();
    const data = {
      message: '[Notifications] orphan cleanup failed',
      messageRecognized: true,
      args: [
        '[Notifications] orphan cleanup failed',
        { entryText: 'SECRET_JOURNAL' },
      ],
      stack: 'at 154:28\nat 1:90231',
    };
    await service.ingestBatch(
      {
        events: [
          { ts: 123, level: 'warn', kind: 'error', name: 'console_warn', data },
        ],
      },
      { requestId: 'readable-console' },
    );
    const rows = query.values.mock.calls[0][0] as Array<
      Record<string, unknown>
    >;
    const stored = JSON.stringify(rows);
    expect(stored).toContain('[Notifications] orphan cleanup failed');
    expect(stored).toContain('at 154:28');
    expect(stored).not.toContain('SECRET_');
    expect(
      sanitizeDiagnostic({
        message:
          'Console warning with unrecognized message; inspect call stack',
        messageRecognized: false,
        stack: data.stack,
      }),
    ).toEqual({
      message: 'Console warning with unrecognized message; inspect call stack',
      messageRecognized: false,
      stack: data.stack,
    });
    expect(
      sanitizeDiagnostic({ message: data.message + ' token=SECRET_TOKEN' }),
    ).toEqual({ message: data.message + ' token=SECRET_TOKEN' });
  });
  it.each(['object', 'json', 'console'])(
    'sanitizes %s legacy data before DB insert',
    async (variant) => {
      const { service, query } = make();
      const error = {
        code: 'ERR_BAD_REQUEST',
        status: 400,
        config: {
          method: 'post',
          url: '/users/change-user-auth-data?format=json',
          data: JSON.stringify({
            newPassword: 'SECRET_PASSWORD',
            hash: 'checksum',
          }),
        },
        response: { data: { userText: 'SECRET_JOURNAL' }, status: 400 },
        cause: {
          message: 'failed because SECRET_JOURNAL',
          payload: { tokenState: 'expired' },
        },
      };
      const data =
        variant === 'json'
          ? JSON.stringify(error)
          : variant === 'console'
            ? { args: ['failed with SECRET_JOURNAL', error] }
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
      query: { entryText: 'SECRET_QUERY' },
      referer: 'https://example.test/page?password=SECRET_PASSWORD',
      errorName: 'AxiosError',
      errorMessage: 'Provider rejected SECRET_PAYLOAD',
      stack: 'Error: SECRET_QUERY\n at run (/src/NewProvider.ts:10:20)',
      meta: {
        errorCode: 'ERR_BAD_REQUEST',
        payload: { entryText: 'SECRET_PAYLOAD' },
      },
    });
    const saved = http.save.mock.calls[0][0];
    expect(JSON.stringify(saved)).not.toContain('SECRET_');
    expect(saved).toMatchObject({
      status: 500,
      path: '/ai/extract-user-memory',
      errorName: 'AxiosError',
      errorMessage: 'Provider rejected [omitted]',
      stack: 'Error: [omitted]\n at run (/src/NewProvider.ts:10:20)',
      meta: { errorCode: 'ERR_BAD_REQUEST' },
    });
  });
  it('persists an HTTP error and its technical cause', async () => {
    const { service, http } = make();
    await service.createServerHttpFail({
      ts: 1,
      level: 'error',
      method: 'POST',
      status: 500,
      path: '/ai/preflight',
      errorMessage: "Cannot read properties of null (reading 'id')",
      meta: {
        cause: {
          message: 'read ECONNRESET',
          code: 'ECONNRESET',
          passwordPolicy: 'enforced',
        },
      },
    });
    expect(http.save.mock.calls[0][0]).toMatchObject({
      errorMessage: "Cannot read properties of null (reading 'id')",
      meta: {
        cause: {
          message: 'read ECONNRESET',
          code: 'ECONNRESET',
          passwordPolicy: 'enforced',
        },
      },
    });
  });
  it('handles native Error and hostile accessors without failing ingestion', () => {
    const error = new Error('Previously unseen native error');
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
