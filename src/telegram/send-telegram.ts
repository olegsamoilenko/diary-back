import axios from 'axios';
import { Logger } from '@nestjs/common';

type ForumTelegramMessage = string | (() => string);
type ForumTelegramChannel = 'FEED' | 'MODERATION' | 'REPORTS';
const forumTelegramLogger = new Logger('ForumTelegram');

/** Optional notification: never change a DB/moderation outcome or leak Axios payloads. */
async function sendForumTelegram(
  channel: ForumTelegramChannel,
  message: ForumTelegramMessage,
): Promise<void> {
  try {
    const token = process.env[`TELEGRAM_FORUM_${channel}_BOT_TOKEN`];
    const chatId = process.env[`TELEGRAM_FORUM_${channel}_CHAT_ID`];
    if (!token || !chatId)
      throw new Error('Telegram channel is not configured');
    await axios.post(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        chat_id: chatId,
        text: typeof message === 'function' ? message() : message,
        parse_mode: 'HTML',
      },
      // Bound only the detached network request, never the user's save operation.
      { timeout: 30_000 },
    );
  } catch {
    // Do not log the error: Axios may contain bot token, chat ID and private text.
    try {
      forumTelegramLogger.warn(
        `Community Telegram delivery failed (${channel}); stored data and moderation outcome unchanged`,
      );
    } catch {
      // A logging sink failure must not create an unhandled detached rejection.
    }
  }
}

export async function sendAlertTelegram(message: string) {
  const token = process.env.TELEGRAM_ALERT_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ALERT_CHAT_ID;

  await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: chatId,
    text: message,
  });
}

export async function sendForumFeedTelegram(message: ForumTelegramMessage) {
  await sendForumTelegram('FEED', message);
}

export async function sendForumModerationTelegram(
  message: ForumTelegramMessage,
) {
  await sendForumTelegram('MODERATION', message);
}

export async function sendForumReportsTelegram(message: ForumTelegramMessage) {
  await sendForumTelegram('REPORTS', message);
}

export async function sendAiErrorsTelegram(message: string) {
  const token = process.env.TELEGRAM_AI_ERRORS_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_AI_ERRORS_CHAT_ID;

  if (!token || !chatId) {
    return;
  }

  await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: chatId,
    text: message.slice(0, 4000),
  });
}

export async function sendPlansTelegram(message: string) {
  const plansToken = process.env.TELEGRAM_PLANS_BOT_TOKEN;
  const plansChatId = process.env.TELEGRAM_PLANS_CHAT_ID;

  if (plansToken && plansChatId) {
    try {
      await axios.post(
        `https://api.telegram.org/bot${plansToken}/sendMessage`,
        {
          chat_id: plansChatId,
          text: message,
        },
      );
      return;
    } catch {
      // Try the configured fallback transport below.
    }
  }

  const fallbackToken = process.env.TELEGRAM_ALERT_BOT_TOKEN;
  const fallbackChatId = process.env.TELEGRAM_ALERT_CHAT_ID;

  if (!fallbackToken || !fallbackChatId) {
    return;
  }

  await axios.post(`https://api.telegram.org/bot${fallbackToken}/sendMessage`, {
    chat_id: fallbackChatId,
    text: message,
  });
}

/** Purchase announcements have their own destination; never fall back to alerts. */
export async function sendPurchasesTelegram(message: string): Promise<void> {
  const token = process.env.TELEGRAM_NEW_SUBSCRIPTIONS_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_NEW_SUBSCRIPTIONS_CHAT_ID;
  if (!token || !chatId) throw new Error('Purchase channel is not configured');
  const response = await axios.post(
    `https://api.telegram.org/bot${token}/sendMessage`,
    { chat_id: chatId, text: message, link_preview_options: { is_disabled: true } },
    { timeout: 30_000 },
  );
  if (response.data?.ok !== true) throw new Error('Purchase delivery rejected');
}
