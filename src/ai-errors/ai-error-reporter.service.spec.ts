import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { APIError } from 'openai';
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
  it('distinguishes an OpenAI rejection from the HTTP 500 without exposing the prompt', () => {
    const error = APIError.generate(
      400,
      { error: { code: 'moderation_blocked', message: 'SECRET_PROMPT' } },
      undefined,
      new Headers({ 'x-request-id': 'req_123', authorization: 'SECRET_KEY' }),
    );
    new AiErrorReporterService().report({
      operation: 'HTTP POST /ai/images/generate',
      transport: 'http',
      status: 500,
      requestId: 'nemory-123',
      error,
    });
    const alert = jest.mocked(sendAiErrorsTelegram).mock.calls[0][0];
    expect(alert).toContain('Status: 500');
    expect(alert).toContain('Request ID: nemory-123');
    expect(alert).toContain('Provider status: 400');
    expect(alert).toContain('Provider error code: moderation_blocked');
    expect(alert).toContain('Provider request_id: req_123');
    expect(alert).not.toContain('SECRET_');
  });

  it('omits malformed metadata even when the SDK error is wrapped', () => {
    const cause = new APIError(
      400,
      { code: 'SECRET_PROMPT with spaces' },
      undefined,
      new Headers({ 'x-request-id': 'SECRET_PROMPT with spaces' }),
    );
    new AiErrorReporterService().report({
      operation: 'images',
      transport: 'http',
      error: new Error('SECRET_PROMPT', { cause }),
    });
    const alert = jest.mocked(sendAiErrorsTelegram).mock.calls[0][0];
    expect(alert).toContain('Provider status: 400');
    expect(alert).not.toMatch(
      /Provider error code|Provider request_id|SECRET_/,
    );
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

  it('suppresses only explicitly classified media misses, never server errors', () => {
    const probe = {
      path: '/ai/media/11111111-1111-4111-8111-111111111111',
      status: 404,
      userId: 42,
    };
    expect(shouldReportAiHttpError(probe)).toBe(true);
    expect(
      shouldReportAiHttpError({ ...probe, expectedMediaStatusMiss: true }),
    ).toBe(false);
    expect(
      shouldReportAiHttpError({
        ...probe,
        status: 500,
        expectedMediaStatusMiss: true,
      }),
    ).toBe(true);
    expect(shouldReportAiHttpError({ ...probe, path: '/ai/unknown' })).toBe(
      true,
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

  it.each(['stop', 'PRIVATE_REASON', null])(
    'projects safe empty-answer diagnostics for finish reason %s',
    (finishReason) => {
      new AiErrorReporterService().report({
        code: 'AI_USAGE_WITHOUT_ANSWER',
        operation: 'generate_dialog_response',
        transport: 'background',
        error: new Error('PRIVATE_ERROR'),
        meta: {
          finishReason,
          textReceived: false,
          refusalReceived: true,
          prompt: 'PRIVATE_PROMPT',
          content: 'PRIVATE_CONTENT',
          refusal: 'PRIVATE_REFUSAL',
        },
      });
      const alert = jest.mocked(sendAiErrorsTelegram).mock.calls[0][0];
      expect(alert).toContain('no usable answer text');
      expect(alert).toContain(
        `finishReason: ${finishReason === 'stop' ? 'stop' : 'unknown'}`,
      );
      expect(alert).toContain('textReceived: false');
      expect(alert).toContain('refusalReceived: true');
      expect(alert).not.toContain('PRIVATE_');
    },
  );

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
