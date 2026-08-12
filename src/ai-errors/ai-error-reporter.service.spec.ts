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
    expect(shouldReportAiHttpError({ path: '/robots.txt', status: 500 })).toBe(
      false,
    );
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
