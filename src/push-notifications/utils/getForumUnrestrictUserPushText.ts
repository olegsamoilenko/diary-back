import { resolveLocale } from './resolveLocale';

export function getForumUnrestrictUserPushText(params: {
  locale?: string | null;
}) {
  const lang = resolveLocale(params.locale);

  if (lang === 'uk') {
    return {
      title: 'Доступ до спільноти відновлено',
      body: 'Ви знову можете брати участь у спільноті: створювати теми, писати коментарі та відповідати іншим.',
    };
  }

  if (lang === 'pl') {
    return {
      title: 'Dostęp do społeczności został przywrócony',
      body: 'Możesz ponownie uczestniczyć w społeczności: tworzyć tematy, pisać komentarze i odpowiadać innym.',
    };
  }

  if (lang === 'de') {
    return {
      title: 'Community-Zugang wiederhergestellt',
      body: 'Du kannst jetzt wieder an der Community teilnehmen: Themen erstellen, Kommentare schreiben und anderen antworten.',
    };
  }

  return {
    title: 'Community access restored',
    body: 'You can now participate in the community again: create topics, write comments, and reply to others.',
  };
}
