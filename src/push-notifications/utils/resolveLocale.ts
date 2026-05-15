type SupportedLocale = 'en' | 'uk' | 'pl' | 'de';

const SUPPORTED_LOCALES: SupportedLocale[] = ['en', 'uk', 'pl', 'de'];

export function resolveLocale(locale?: string | null): SupportedLocale {
  const lang = locale?.toLowerCase().split(/[-_]/)[0];

  if (lang && SUPPORTED_LOCALES.includes(lang as SupportedLocale)) {
    return lang as SupportedLocale;
  }

  if (lang === 'ru') {
    return 'uk';
  }

  return 'en';
}
