import { resolveLocale } from './resolveLocale';

export function getForumRemoveCommentPushText(params: {
  locale?: string | null;
  commentContent: string;
  note: string;
}) {
  const lang = resolveLocale(params.locale);

  if (lang === 'uk') {
    return {
      title: 'Ваш коментар був видалений',
      body: `Ми видалили ваш коментар «${params.commentContent}».\n Причина: ${params.note}`,
    };
  }

  if (lang === 'pl') {
    return {
      title: 'Twój komentarz został usunięty',
      body: `Usunęliśmy Twój komentarz „${params.commentContent}”.\n Powód: ${params.note}`,
    };
  }

  if (lang === 'de') {
    return {
      title: 'Dein Kommentar wurde entfernt',
      body: `Wir haben deinen Kommentar „${params.commentContent}“ entfernt.\n Grund: ${params.note}`,
    };
  }

  return {
    title: 'Your comment has been removed',
    body: `We have removed your comment "${params.commentContent}".\n Reason: ${params.note}`,
  };
}
