import type { AiPreferences } from './types';

export function deriveColumnsFromPrefs(p: AiPreferences) {
  const s = p.style;

  return {
    schemaVersion: p.schemaVersion ?? 1,
    providerPreference: p.providerPreference ?? 'auto',
    qualityTier: p.qualityTier ?? 'auto',
    separateProfilesByMode: p.separateProfilesByMode ?? false,

    preset: s.preset ?? null,

    role: s.role,
    tone: s.tone,
    length: s.length,
    depth: s.depth,
    structure: s.structure,
    questions: s.questions,
    directness: s.directness,
    humor: s.humor,
    sarcasm: s.sarcasm,
    phraseOfTheDay: s.phraseOfTheDay,

    emojis: s.emojis,
    delivery: s.delivery,
    practicality: s.practicality,
    mirroring: s.mirroring,
    assumptionCaution: s.assumptionCaution,
    challenge: s.challenge,
    sensitivity: s.sensitivity,

    ritualOneSentenceSummary: !!s.rituals?.oneSentenceSummary,
    ritualOneQuestionAtEnd: !!s.rituals?.oneQuestionAtEnd,
    ritualOneSmallStepToday: !!s.rituals?.oneSmallStepToday,
    ritualPhraseOfDay: !!s.rituals?.phraseOfDay,
    ritualRatingCheckIn: !!s.rituals?.ratingCheckIn,
  };
}
