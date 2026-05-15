import { resolveLocale } from './resolveLocale';

export function getForumRestoreCommentPushText(params: {
  locale?: string | null;
  commentContent: string;
}) {
  const lang = resolveLocale(params.locale);

  if (lang === 'uk') {
    return {
      title: 'Ваш коментар був відновлений',
      body: `Ми відновили ваш коментар «${params.commentContent}».`,
    };
  }

  if (lang === 'pl') {
    return {
      title: 'Twój komentarz został przywrócony',
      body: `Przywróciliśmy Twój komentarz „${params.commentContent}”.`,
    };
  }

  if (lang === 'de') {
    return {
      title: 'Dein Kommentar wurde wiederhergestellt',
      body: `Wir haben deinen Kommentar „${params.commentContent}“ wiederhergestellt.`,
    };
  }

  return {
    title: 'Your comment has been restored',
    body: `We have restored your comment "${params.commentContent}"`,
  };
}
