import { resolveLocale } from './resolveLocale';

export function getForumNewCommentPushText(params: {
  locale?: string | null;
  isReplyToRecipient?: boolean;
  authorName: string;
  topicTitle: string;
}) {
  const lang = resolveLocale(params.locale);

  if (params.isReplyToRecipient) {
    const replies = {
      uk: {
        title: 'Відповідь на твій коментар',
        body: `${params.authorName} відповів(-ла) на твій коментар у темі «${params.topicTitle}»`,
      },
      pl: {
        title: 'Odpowiedź na Twój komentarz',
        body: `${params.authorName} odpowiedział(a) na Twój komentarz w temacie „${params.topicTitle}”`,
      },
      de: {
        title: 'Antwort auf deinen Kommentar',
        body: `${params.authorName} hat auf deinen Kommentar in „${params.topicTitle}“ geantwortet`,
      },
      en: {
        title: 'Reply to your comment',
        body: `${params.authorName} replied to your comment in “${params.topicTitle}”`,
      },
    };
    return replies[lang] ?? replies.en;
  }

  if (lang === 'uk') {
    return {
      title: 'Новий коментар у темі',
      body: `${params.authorName} залишив(-ла) коментар у темі «${params.topicTitle}»`,
    };
  }

  if (lang === 'pl') {
    return {
      title: 'Nowy komentarz w obserwowanym temacie',
      body: `${params.authorName} skomentował(a) temat „${params.topicTitle}”`,
    };
  }

  if (lang === 'de') {
    return {
      title: 'Neuer Kommentar in einem beobachteten Thema',
      body: `${params.authorName} hat „${params.topicTitle}“ kommentiert`,
    };
  }

  return {
    title: 'New comment in a followed topic',
    body: `${params.authorName} commented on “${params.topicTitle}”`,
  };
}
