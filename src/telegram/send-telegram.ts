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
