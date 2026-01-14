export type AiProvider = 'auto' | 'openai' | 'anthropic' | 'google';
export type QualityTier = 'auto' | 'fast' | 'smart';

export type Role = 'friend' | 'coach' | 'therapeutic' | 'mentor' | 'teacher';
export type Tone = 'warm' | 'neutral' | 'playful' | 'calm' | 'energetic';
export type Length = 'short' | 'normal' | 'detailed';
export type Depth = 'light' | 'balanced' | 'deep';
export type Structure = 'freeform' | 'bullets' | 'sections';
export type QuestionRate = 'few' | 'normal' | 'many';
export type Directness = 'soft' | 'balanced' | 'direct';
export type Humor = 'off' | 'light' | 'normal';
export type Sarcasm = 'off' | 'light' | 'normal' | 'sarcastic';
export type PhraseOfTheDay = 'on' | 'off';

export type Emojis = 'none' | 'some' | 'a_lot';
export type Delivery = 'straight' | 'explanations' | 'examples' | 'metaphors';
export type Practicality =
  | 'reflection_only'
  | 'advice_plus_1_step'
  | 'plan_3_5_steps'
  | 'plan_plus_checkins';
export type Mirroring = 'low' | 'normal' | 'high';
export type AssumptionCaution = 'ask' | 'some' | 'comfortable';
export type Challenge = 'none' | 'gentle' | 'strong';
export type Sensitivity = 'very_gentle' | 'balanced' | 'friend_like';

export type StylePresetId = 'balanced' | 'concise' | 'deep' | 'coach' | 'buddy';

export type ReplyRituals = {
  oneSentenceSummary: boolean;
  oneQuestionAtEnd: boolean;
  oneSmallStepToday: boolean;
  phraseOfDay: boolean;
  ratingCheckIn: boolean;
};

export type ResponseStyle = {
  preset?: StylePresetId | null;

  role: Role;
  tone: Tone;
  length: Length;
  depth: Depth;
  structure: Structure;
  questions: QuestionRate;
  directness: Directness;
  humor: Humor;
  sarcasm: Sarcasm;
  phraseOfTheDay: PhraseOfTheDay;

  emojis: Emojis;
  delivery: Delivery;
  practicality: Practicality;
  mirroring: Mirroring;
  assumptionCaution: AssumptionCaution;
  challenge: Challenge;
  sensitivity: Sensitivity;

  rituals: ReplyRituals;
};

type StyleOverride = Partial<
  Pick<ResponseStyle, 'length' | 'depth' | 'questions'>
>;

export type AiPreferences = {
  providerPreference: AiProvider;
  qualityTier: QualityTier;
  separateProfilesByMode: boolean;
  style: ResponseStyle;
  entryStyle?: StyleOverride | null;
  dialogStyle?: StyleOverride | null;
  schemaVersion: number;
};

export type AiPrefsPayload = {
  prefs: AiPreferences;
  rowVersion: number;
  updatedAt: string; // ISO
};
