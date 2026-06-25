import axios from 'axios';

export async function sendAlertTelegram(message: string) {
  const token = process.env.TELEGRAM_ALERT_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ALERT_CHAT_ID;

  await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: chatId,
    text: message,
  });
}

export async function sendForumFeedTelegram(message: string) {
  const token = process.env.TELEGRAM_FORUM_FEED_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_FORUM_FEED_CHAT_ID;

  await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML',
  });
}

export async function sendForumModerationTelegram(message: string) {
  const token = process.env.TELEGRAM_FORUM_MODERATION_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_FORUM_MODERATION_CHAT_ID;

  await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML',
  });
}

export async function sendForumReportsTelegram(message: string) {
  const token = process.env.TELEGRAM_FORUM_REPORTS_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_FORUM_REPORTS_CHAT_ID;

  await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML',
  });
}

export async function sendPlansTelegram(message: string) {
  const plansToken = process.env.TELEGRAM_PLANS_BOT_TOKEN;
  const plansChatId = process.env.TELEGRAM_PLANS_CHAT_ID;

  if (plansToken && plansChatId) {
    try {
      await axios.post(`https://api.telegram.org/bot${plansToken}/sendMessage`, {
        chat_id: plansChatId,
        text: message,
      });
      return;
    } catch (error) {
      console.warn('Failed to send plans Telegram alert:', error);
    }
  }

  const fallbackToken = process.env.TELEGRAM_ALERT_BOT_TOKEN;
  const fallbackChatId = process.env.TELEGRAM_ALERT_CHAT_ID;

  if (!fallbackToken || !fallbackChatId) {
    console.warn(
      'Plans Telegram alert skipped: TELEGRAM_PLANS_* and TELEGRAM_ALERT_* are not configured.',
    );
    return;
  }

  await axios.post(`https://api.telegram.org/bot${fallbackToken}/sendMessage`, {
    chat_id: fallbackChatId,
    text: message,
  });
}
