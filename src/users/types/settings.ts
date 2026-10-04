export enum AiModel {
  GPT_IMAGE_2_5_FLARE = 'gpt-image-2.5-flare',
  GPT_4O_MINI_TRANSCRIBE = 'gpt-4o-mini-transcribe',
  QWEN_3_8_MAX = 'qwen3.8-max',
  GPT_5_6_TERRA = 'gpt-5.6-terra',
  GPT_5_6_LUNA = 'gpt-5.6-luna',
  GPT_5_4 = 'gpt-5.4',
  GPT_5_2 = 'gpt-5.2',
  GPT_5_1 = 'gpt-5.1',
  GPT_5 = 'gpt-5',
  GPT_5_MINI = 'gpt-5-mini',
  GPT_4_1 = 'gpt-4.1',
  GPT_4_O = 'gpt-4o',
  // GPT_4_1_MINI = 'gpt-4.1-mini',
  TEXT_EMBEDDING_3_SMALL = 'text-embedding-3-small',
  CLAUDE_SONNET_4_5 = 'claude-sonnet-4-5',
  CLAUDE_HAIKU_4_5 = 'claude-haiku-4-5',
  CLAUDE_OPUS_4_5 = 'claude-opus-4-5',
  CLAUDE_OPUS_5 = 'claude-opus-5',
  CLAUDE_OPUS_4_7 = 'claude-opus-4-7',
  CLAUDE_SONNET_5 = 'claude-sonnet-5',
  CLAUDE_SONNET_5_5 = 'claude-sonnet-5-5',
  CLAUDE_SONNET_4_6 = 'claude-sonnet-4-6',
}

export const DEFAULT_AI_MODEL = AiModel.GPT_5_6_TERRA;

export const AI_MODEL_STORAGE_VALUES: string[] = Object.values(AiModel);

export function normalizeAiModel(value: unknown): AiModel {
  // Sonnet 5 is replaced for new requests; historical usage keeps its original ID.
  if (value === AiModel.CLAUDE_SONNET_5) return AiModel.CLAUDE_SONNET_5_5;
  return Object.values(AiModel).includes(value as AiModel)
    ? (value as AiModel)
    : DEFAULT_AI_MODEL;
}

export enum Theme {
  CUSTOM = 'custom',
  LIGHT = 'light',
  SILENT_PEAKS = 'silentPeaks',
  GOLDEN_HOUR = 'goldenHour',
  VINTAGE_PAPER = 'vintagePaper',
  ZEN_MIND = 'zenMind',
  BALANCE = 'balance',
  LEAF_SCAPE = 'leafScape',
  PASTEL_COLLAGE = 'pastelCollage',
  SEA_WHISPER = 'seaWhisper',
  WHITE_LOTUS = 'whiteLotus',
  PINK_WHISPER = 'pinkWhisper',
  PAPER_ROSE = 'paperRose',
  BLUE_BLOOM = 'blueBloom',
  SOFT_WAVES = 'softWaves',
  CALM_MIND = 'calmMind',
  ORANGE = 'orange',
  BALL = 'ball',
  COMPASS = 'compass',
  OCEAN_DEPTHS = 'oceanDepths',
  NEON_FOCUS = 'neonFocus',
  CIPHERED_NIGHT = 'cipheredNight',
  DREAM_ACHIEVE = 'dreamAchieve',
  TIME_TO_LIVE = 'timeToLive',
  DARK = 'dark',
}

export enum Font {
  ROBOTO = 'Roboto',
  OPEN_SANS = 'OpenSans',
  SF_PRO_DISPLAY = 'SFProDisplay',
  MONSERRAT = 'Montserrat',
  INTER = 'Inter',
  LATO = 'Lato',
  NUNITO = 'Nunito',
  SOURCE_CODE_PRO = 'SourceCodePro',
  FIRA_SANS = 'FiraSans',
  MANROPE = 'Manrope',
  TINOS = 'Tinos',
  UBUNTU = 'Ubuntu',
  EXO2 = 'Exo2',
  OSWALD = 'Oswald',
  RUBIK = 'Rubik',
}

export enum TimeFormat {
  '12_H' = '12h',
  '24_H' = '24h',
}

export enum DateFormat {
  DMY = 'dmy',
  MDY = 'mdy',
}

export enum Lang {
  EN = 'en',
  UK = 'uk',
  DE = 'de',
  PL = 'pl',
}

export enum ConversationLanguage {
  ID = 'id',
  MS = 'ms',
  BS = 'bs',
  CA = 'ca',
  CS = 'cs',
  DA = 'da',
  DE = 'de',
  EN = 'en',
  ES = 'es',
  FR = 'fr',
  GL = 'gl',
  HR = 'hr',
  IT = 'it',
  HU = 'hu',
  NL = 'nl',
  NO = 'no',
  PL = 'pl',
  PT = 'pt',
  RO = 'ro',
  SK = 'sk',
  FI = 'fi',
  SV = 'sv',
  TL = 'tl',
  VI = 'vi',
  TR = 'tr',
  BG = 'bg',
  MK = 'mk',
  UK = 'uk',
  AR = 'ar',
  ZH = 'zh',
  EL = 'el',
  HI = 'hi',
  JA = 'ja',
  KO = 'ko',
  TA = 'ta',
  TH = 'th',
}

export enum FirstDayOfWeek {
  SUNDAY = 0,
  MONDAY = 1,
  FRIDAY = 5,
  SATURDAY = 6,
}

export enum DiaryTabVariant {
  LEGACY = 'legacy',
  DIARY_AND_CALENDAR = 'diary_and_calendar',
  CALENDAR_ONLY = 'calendar_only',
}

export enum CalendarIconFutureRange {
  TODAY = 'today',
  TODAY_AND_TOMORROW = 'today_and_tomorrow',
  DAYS_7 = '7_days',
  DAYS_30 = '30_days',
  ALL = 'all',
}
