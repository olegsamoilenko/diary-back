import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { sendAiErrorsTelegram } from 'src/telegram/send-telegram';
import {
  AiErrorReporterService,
  shouldReportAiHttpError,
} from './ai-error-reporter.service';

jest.mock('src/telegram/send-telegram', () => ({
  sendAiErrorsTelegram: jest.fn(() => Promise.resolve()),
}));

describe('AiErrorReporterService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('omits provider echoes and metadata payloads from alerts', () => {
    const service = new AiErrorReporterService();
    service.report({
      operation: 'embeddings',
      transport: 'http',
      error: new Error('SECRET_PROVIDER_ECHO'),
      code: 'ERR_NETWORK',
      meta: {
        platform: 'android',
        prompt: 'SECRET_PROMPT',
        newPassword: 'SECRET_PASSWORD',
      },
    });
    const alert = jest.mocked(sendAiErrorsTelegram).mock.calls[0][0];
    expect(alert).not.toContain('SECRET_');
    expect(alert).toContain('ERR_NETWORK');
    expect(alert).toContain('platform: android');
  });
  it('sends a safe AI error alert and suppresses an immediate duplicate', () => {
    const service = new AiErrorReporterService();
    const error = new Error('provider timeout');

    service.report({
      operation: 'stream_ai_comment',
      transport: 'websocket',
      error,
      userId: 42,
      model: 'gpt-test',
      meta: { platform: 'android' },
    });
    service.report({
      operation: 'stream_ai_comment',
      transport: 'websocket',
      error,
      userId: 42,
      model: 'gpt-test',
      meta: { platform: 'android' },
    });

    expect(sendAiErrorsTelegram).toHaveBeenCalledTimes(1);
    expect(sendAiErrorsTelegram).toHaveBeenCalledWith(
      expect.stringContaining('🚨 AI SERVER ERROR'),
    );
    expect(sendAiErrorsTelegram).toHaveBeenCalledWith(
      expect.stringContaining('Operation: stream_ai_comment'),
    );
    expect(sendAiErrorsTelegram).toHaveBeenCalledWith(
      expect.stringContaining('User ID: 42'),
    );
    expect(sendAiErrorsTelegram).toHaveBeenCalledWith(
      expect.not.stringContaining('entryText'),
    );
  });

  it('reports authenticated AI failures and ignores bot 404s and plan limits', () => {
    expect(
      shouldReportAiHttpError({
        path: '/ai/generate-embeddings',
        status: 500,
      }),
    ).toBe(true);
    expect(
      shouldReportAiHttpError({
        path: '/ai/generate-embeddings',
        status: 400,
        userId: 42,
      }),
    ).toBe(true);
    expect(shouldReportAiHttpError({ path: '/ai/unknown', status: 404 })).toBe(
      false,
    );
    expect(
      shouldReportAiHttpError({
        path: '/ai/preflight',
        status: 482,
        userId: 42,
      }),
    ).toBe(false);
    expect(
      shouldReportAiHttpError({
        path: '/ai/preflight',
        status: 496,
        userId: 42,
      }),
    ).toBe(false);
    expect(shouldReportAiHttpError({ path: '/robots.txt', status: 500 })).toBe(
      false,
    );
  });

  it('reports charged empty answers per user and request while suppressing the same incident', () => {
    const service = new AiErrorReporterService();
    const report = {
      operation: 'generate_conversation_response',
      transport: 'background' as const,
      code: 'AI_USAGE_WITHOUT_ANSWER',
      userId: 42,
      requestId: 'request-a',
      error: new Error(
        'Provider usage charged, but no answer text was received.',
      ),
      meta: { inputTokens: 100, outputTokens: 25, chargedCredits: 3 },
    };
    service.report(report);
    service.report(report);
    service.report({ ...report, requestId: 'request-b' });
    service.report({ ...report, userId: 43 });
    expect(sendAiErrorsTelegram).toHaveBeenCalledTimes(3);
    expect(sendAiErrorsTelegram).toHaveBeenCalledWith(
      expect.stringContaining('chargedCredits: 3'),
    );
    expect(sendAiErrorsTelegram).toHaveBeenCalledWith(
      expect.stringContaining('User ID: 43'),
    );
  });

  it('extracts nested network codes without sending cause messages or request data', () => {
    const service = new AiErrorReporterService();
    const networkError = Object.assign(new Error('private request details'), {
      code: 'ECONNRESET',
      headers: { authorization: 'secret-token' },
      body: 'private journal',
    });
    service.report({
      operation: 'HTTP POST /ai/generate-embeddings',
      transport: 'http',
      error: new Error('Connection error.', {
        cause: new TypeError('fetch failed', { cause: networkError }),
      }),
    });

    const alert = jest.mocked(sendAiErrorsTelegram).mock.calls[0][0];
    expect(alert).toContain('Cause codes: ECONNRESET');
    expect(alert).not.toMatch(/private request|secret-token|private journal/);
  });

  it('handles aggregate and cyclic causes, and distinguishes different network failures', () => {
    const service = new AiErrorReporterService();
    const timeout = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
    const aggregate = new AggregateError([
      timeout,
      timeout,
      { code: 'ENETUNREACH' },
      { code: 'invalid code with private text' },
    ]);
    aggregate.cause = aggregate;
    for (const cause of [aggregate, { code: 'ENOTFOUND' }, aggregate]) {
      service.report({
        operation: 'embeddings',
        transport: 'http',
        error: new Error('Connection error.', { cause }),
      });
    }

    expect(sendAiErrorsTelegram).toHaveBeenCalledTimes(2);
    const calls = jest.mocked(sendAiErrorsTelegram).mock.calls;
    expect(calls[0][0]).toContain('Cause codes: ENETUNREACH, ETIMEDOUT');
    expect(calls[0][0]).not.toContain('invalid code');
    expect(calls[1][0]).toContain('Cause codes: ENOTFOUND');
  });

  it('sends a clearly marked startup test when the test flag is enabled', () => {
    const previous = process.env.TELEGRAM_AI_ERRORS_TEST_ON_STARTUP;
    process.env.TELEGRAM_AI_ERRORS_TEST_ON_STARTUP = 'true';

    try {
      const service = new AiErrorReporterService();
      service.onApplicationBootstrap();

      expect(sendAiErrorsTelegram).toHaveBeenCalledWith(
        expect.stringContaining('🧪 AI ERROR ALERT TEST'),
      );
    } finally {
      if (previous == null) {
        delete process.env.TELEGRAM_AI_ERRORS_TEST_ON_STARTUP;
      } else {
        process.env.TELEGRAM_AI_ERRORS_TEST_ON_STARTUP = previous;
      }
    }
  });
});
