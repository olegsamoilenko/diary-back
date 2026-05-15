import { resolveLocale } from './resolveLocale';

export function getForumRestoreTopicPushText(params: {
  locale?: string | null;
  topicTitle: string;
}) {
  const lang = resolveLocale(params.locale);

  if (lang === 'uk') {
    return {
      title: 'Ваша тема була відновлена',
      body: `Ми відновили вашу тему «${params.topicTitle}».`,
    };
  }

  if (lang === 'pl') {
    return {
      title: 'Twój temat został przywrócony',
      body: `Przywróciliśmy Twój temat „${params.topicTitle}”.`,
    };
  }

  if (lang === 'de') {
    return {
      title: 'Dein Thema wurde wiederhergestellt',
      body: `Wir haben dein Thema „${params.topicTitle}“ wiederhergestellt.`,
    };
  }

  return {
    title: 'Your topic has been restored',
    body: `We have restored your topic "${params.topicTitle}"`,
  };
}
