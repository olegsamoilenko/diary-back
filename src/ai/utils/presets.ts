import type { StylePresetId, ResponseStyle } from '../types';

const STYLE_PRESETS: Record<StylePresetId, ResponseStyle> = {
  balanced: {
    role: 'friend',
    tone: 'warm',
    length: 'normal',
    depth: 'balanced',
    structure: 'sections',
    questions: 'normal',
    directness: 'balanced',
    humor: 'light',
    sarcasm: 'light',
    phraseOfTheDay: 'on',

    emojis: 'none',
    delivery: 'explanations',
    practicality: 'advice_plus_1_step',
    mirroring: 'normal',
    assumptionCaution: 'ask',
    challenge: 'gentle',
    sensitivity: 'balanced',

    rituals: {
      oneSentenceSummary: false,
      oneQuestionAtEnd: false,
      oneSmallStepToday: false,
      phraseOfDay: false,
      ratingCheckIn: false,
    },
  },

  concise: {
    // TODO
    role: 'friend',
    tone: 'neutral',
    length: 'short',
    depth: 'light',
    structure: 'bullets',
    questions: 'few',
    directness: 'direct',
    humor: 'off',
    sarcasm: 'off',
    phraseOfTheDay: 'off',

    emojis: 'none',
    delivery: 'straight',
    practicality: 'advice_plus_1_step',
    mirroring: 'low',
    assumptionCaution: 'some',
    challenge: 'none',
    sensitivity: 'balanced',

    rituals: {
      oneSentenceSummary: false,
      oneQuestionAtEnd: false,
      oneSmallStepToday: false,
      phraseOfDay: false,
      ratingCheckIn: false,
    },
  },

  deep: {
    // TODO
    role: 'mentor',
    tone: 'calm',
    length: 'detailed',
    depth: 'deep',
    structure: 'sections',
    questions: 'many',
    directness: 'balanced',
    humor: 'off',
    sarcasm: 'off',
    phraseOfTheDay: 'off',

    emojis: 'none',
    delivery: 'explanations',
    practicality: 'plan_3_5_steps',
    mirroring: 'normal',
    assumptionCaution: 'ask',
    challenge: 'gentle',
    sensitivity: 'very_gentle',

    rituals: {
      oneSentenceSummary: false,
      oneQuestionAtEnd: false,
      oneSmallStepToday: false,
      phraseOfDay: false,
      ratingCheckIn: false,
    },
  },

  coach: {
    // TODO
    role: 'coach',
    tone: 'energetic',
    length: 'normal',
    depth: 'balanced',
    structure: 'bullets',
    questions: 'normal',
    directness: 'direct',
    humor: 'light',
    sarcasm: 'light',
    phraseOfTheDay: 'on',

    emojis: 'none',
    delivery: 'straight',
    practicality: 'plan_3_5_steps',
    mirroring: 'low',
    assumptionCaution: 'some',
    challenge: 'strong',
    sensitivity: 'balanced',

    rituals: {
      oneSentenceSummary: false,
      oneQuestionAtEnd: false,
      oneSmallStepToday: false,
      phraseOfDay: false,
      ratingCheckIn: false,
    },
  },

  buddy: {
    // TODO
    role: 'friend',
    tone: 'playful',
    length: 'normal',
    depth: 'balanced',
    structure: 'freeform',
    questions: 'normal',
    directness: 'balanced',
    humor: 'normal',
    sarcasm: 'normal',
    phraseOfTheDay: 'on',

    emojis: 'some',
    delivery: 'examples',
    practicality: 'advice_plus_1_step',
    mirroring: 'high',
    assumptionCaution: 'some',
    challenge: 'gentle',
    sensitivity: 'friend_like',

    rituals: {
      oneSentenceSummary: true,
      oneQuestionAtEnd: true,
      oneSmallStepToday: true,
      phraseOfDay: true,
      ratingCheckIn: false,
    },
  },
};

export function getStyleByPreset(preset: StylePresetId): ResponseStyle {
  return STYLE_PRESETS[preset];
}
