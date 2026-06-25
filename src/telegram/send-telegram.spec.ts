import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import axios from 'axios';
import { sendPlansTelegram } from './send-telegram';

jest.mock('axios', () => ({
  post: jest.fn(),
}));

describe('sendPlansTelegram', () => {
  const originalEnv = process.env;
  let consoleWarnSpy: jest.SpiedFunction<typeof console.warn>;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleWarnSpy.mockRestore();
  });

  it('sends plan alerts through the dedicated plans bot when it is configured', async () => {
    process.env.TELEGRAM_PLANS_BOT_TOKEN = 'plans-token';
    process.env.TELEGRAM_PLANS_CHAT_ID = 'plans-chat';
    process.env.TELEGRAM_ALERT_BOT_TOKEN = 'alert-token';
    process.env.TELEGRAM_ALERT_CHAT_ID = 'alert-chat';
    (axios.post as any).mockResolvedValueOnce({ data: { ok: true } });

    await sendPlansTelegram('paid plan warning');

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledWith(
      'https://api.telegram.org/botplans-token/sendMessage',
      {
        chat_id: 'plans-chat',
        text: 'paid plan warning',
      },
    );
  });

  it('falls back to the alert bot when plans env is missing', async () => {
    delete process.env.TELEGRAM_PLANS_BOT_TOKEN;
    delete process.env.TELEGRAM_PLANS_CHAT_ID;
    process.env.TELEGRAM_ALERT_BOT_TOKEN = 'alert-token';
    process.env.TELEGRAM_ALERT_CHAT_ID = 'alert-chat';
    (axios.post as any).mockResolvedValueOnce({ data: { ok: true } });

    await sendPlansTelegram('paid plan warning');

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledWith(
      'https://api.telegram.org/botalert-token/sendMessage',
      {
        chat_id: 'alert-chat',
        text: 'paid plan warning',
      },
    );
  });

  it('falls back to the alert bot when plans bot request fails', async () => {
    process.env.TELEGRAM_PLANS_BOT_TOKEN = 'plans-token';
    process.env.TELEGRAM_PLANS_CHAT_ID = 'plans-chat';
    process.env.TELEGRAM_ALERT_BOT_TOKEN = 'alert-token';
    process.env.TELEGRAM_ALERT_CHAT_ID = 'alert-chat';
    (axios.post as any)
      .mockRejectedValueOnce(new Error('plans bot failed'))
      .mockResolvedValueOnce({ data: { ok: true } });

    await sendPlansTelegram('paid plan warning');

    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(axios.post).toHaveBeenNthCalledWith(
      2,
      'https://api.telegram.org/botalert-token/sendMessage',
      {
        chat_id: 'alert-chat',
        text: 'paid plan warning',
      },
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Failed to send plans Telegram alert:',
      expect.any(Error),
    );
  });

  it('warns and skips sending when no Telegram env is configured', async () => {
    delete process.env.TELEGRAM_PLANS_BOT_TOKEN;
    delete process.env.TELEGRAM_PLANS_CHAT_ID;
    delete process.env.TELEGRAM_ALERT_BOT_TOKEN;
    delete process.env.TELEGRAM_ALERT_CHAT_ID;

    await sendPlansTelegram('paid plan warning');

    expect(axios.post).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Plans Telegram alert skipped: TELEGRAM_PLANS_* and TELEGRAM_ALERT_* are not configured.',
    );
  });
});
