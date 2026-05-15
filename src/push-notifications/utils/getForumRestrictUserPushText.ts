import { ForumUserRestrictionType } from '../../forum/types/forum-user-restriction-type.enum';
import { resolveLocale } from './resolveLocale';

function formatRestrictionEndDate(date: Date, lang: 'uk' | 'en' | 'pl' | 'de') {
  return new Intl.DateTimeFormat(
    lang === 'uk'
      ? 'uk-UA'
      : lang === 'pl'
        ? 'pl-PL'
        : lang === 'de'
          ? 'de-DE'
          : 'en-US',
    {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    },
  ).format(date);
}

export function getForumRestrictUserPushText(params: {
  locale?: string | null;
  type: ForumUserRestrictionType;
  endsAt: Date | null;
  reason?: string | null;
}) {
  const lang = resolveLocale(params.locale);
  const isPermanent = !params.endsAt;
  const reason = params.reason?.trim();

  const endsAtText = params.endsAt
    ? formatRestrictionEndDate(params.endsAt, lang)
    : null;

  if (lang === 'uk') {
    return {
      title: 'Доступ до спільноти обмежено',
      body: [
        isPermanent
          ? 'Ваш доступ до участі у спільноті обмежено через порушення правил спільноти.'
          : `Ваш доступ до участі у спільноті тимчасово обмежено через порушення правил спільноти. Обмеження буде знято ${endsAtText}.`,
        reason ? `Причина: ${reason}` : null,
      ]
        .filter(Boolean)
        .join(' '),
    };
  }

  if (lang === 'pl') {
    return {
      title: 'Dostęp do społeczności został ograniczony',
      body: [
        isPermanent
          ? 'Twój dostęp do udziału w społeczności został ograniczony z powodu naruszenia zasad społeczności.'
          : `Twój dostęp do udziału w społeczności został tymczasowo ograniczony z powodu naruszenia zasad społeczności. Ograniczenie zostanie zniesione ${endsAtText}.`,
        reason ? `Powód: ${reason}` : null,
      ]
        .filter(Boolean)
        .join(' '),
    };
  }

  if (lang === 'de') {
    return {
      title: 'Community-Zugang eingeschränkt',
      body: [
        isPermanent
          ? 'Dein Zugang zur Teilnahme an der Community wurde wegen eines Verstoßes gegen die Community-Richtlinien eingeschränkt.'
          : `Dein Zugang zur Teilnahme an der Community wurde wegen eines Verstoßes gegen die Community-Richtlinien vorübergehend eingeschränkt. Die Einschränkung wird am ${endsAtText} aufgehoben.`,
        reason ? `Grund: ${reason}` : null,
      ]
        .filter(Boolean)
        .join(' '),
    };
  }

  return {
    title: 'Community access restricted',
    body: [
      isPermanent
        ? 'Your access to participate in the community has been restricted due to a violation of the community guidelines.'
        : `Your access to participate in the community has been temporarily restricted due to a violation of the community guidelines. The restriction will be lifted on ${endsAtText}.`,
      reason ? `Reason: ${reason}` : null,
    ]
      .filter(Boolean)
      .join(' '),
  };
}
