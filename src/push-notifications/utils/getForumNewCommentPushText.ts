import { resolveLocale } from './resolveLocale';

export function getForumNewCommentPushText(params: {
  locale?: string | null;
  authorName: string;
  topicTitle: string;
}) {
  const lang = resolveLocale(params.locale);

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
