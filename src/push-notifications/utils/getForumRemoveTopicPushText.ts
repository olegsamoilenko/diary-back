import { resolveLocale } from './resolveLocale';

export function getForumRemoveTopicPushText(params: {
  locale?: string | null;
  topicTitle: string;
  note: string;
}) {
  const lang = resolveLocale(params.locale);

  if (lang === 'uk') {
    return {
      title: 'Ваша тема була видалена',
      body: `Ми видалили вашу тему «${params.topicTitle}».\n Причина: ${params.note}`,
    };
  }

  if (lang === 'pl') {
    return {
      title: 'Twój temat został usunięty',
      body: `Usunęliśmy Twój temat „${params.topicTitle}”.\n Powód: ${params.note}`,
    };
  }

  if (lang === 'de') {
    return {
      title: 'Dein Thema wurde entfernt',
      body: `Wir haben dein Thema „${params.topicTitle}“ entfernt.\n Grund: ${params.note}`,
    };
  }

  return {
    title: 'Your topic has been removed',
    body: `We have removed your topic "${params.topicTitle}".\n Reason: ${params.note}`,
  };
}
