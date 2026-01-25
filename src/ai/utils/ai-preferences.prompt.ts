import type {
  AiPreferences,
  ResponseStyle,
  Role,
  Tone,
  Length,
  Depth,
  Directness,
  Humor,
  Sarcasm,
  PhraseOfTheDay,
  Delivery,
  Mirroring,
  Challenge,
  Sensitivity,
} from '../types';

export type AiContextMode = 'generic' | 'entry' | 'dialog';

/**
 * Keep this list minimal now (only what UI uses),
 * but make it easy to expand later.
 */
export type UsedStyle = Pick<
  ResponseStyle,
  | 'role'
  | 'tone'
  | 'length'
  | 'depth'
  | 'directness'
  | 'humor'
  | 'sarcasm'
  | 'phraseOfTheDay'
  | 'delivery'
  | 'mirroring'
  | 'challenge'
  | 'sensitivity'
>;

type Rule = {
  key: keyof UsedStyle;
  label: string;
  meaning: string;
  explain: (v: any) => string;
};

/** --- Per-field instruction maps (expand here later) --- */

const ROLE: Record<Role, string> = {
  friend:
    'Speak as a close supportive friend: warm, human, informal (but respectful). Prioritize empathy + practical help.',
  coach:
    'Act like a coach: focus on action, accountability, and clear next steps. Motivate without fluff.',
  therapeutic:
    'Use a therapeutic style: gentle, careful, non-judgmental; focus on feelings, safety, and self-reflection.',
  mentor:
    'Be a mentor: zoom out to patterns and meaning; long-term perspective and wise conclusions.',
  teacher:
    "Be a teacher: explain the 'why', give tools/exercises and examples; help the user learn and apply skills.",
};

const TONE: Record<Tone, string> = {
  warm: 'Warm and supportive voice; validating and caring.',
  neutral: 'Neutral and clear voice; restrained emotion, maximum clarity.',
  playful:
    'Light and playful voice; friendly jokes to reduce tension, never mocking.',
  calm: 'Calm and grounded voice; reduce anxiety and bring steadiness.',
  energetic: 'Energetic and motivating voice; encourage action and confidence.',
};

const LENGTH: Record<Length, string> = {
  short:
    'Keep it concise: main point + a practical takeaway. Avoid long explanations unless needed.',
  normal: 'Normal length: analysis + practical guidance.',
  detailed:
    'More detailed: deeper analysis + a clearer, structured guidance when helpful.',
};

const DEPTH: Record<Depth, string> = {
  light: 'Light analysis: simple observations and support; avoid deep digging.',
  balanced: 'Balanced analysis: identify patterns + give a useful conclusion.',
  deep: 'Deep analysis: explore causes and recurring patterns; be careful and respectful.',
};

const DIRECTNESS: Record<Directness, string> = {
  soft: 'Be gentle: offer options, avoid blunt statements or pressure.',
  balanced: 'Be direct but tactful: honest conclusions with empathy.',
  direct: 'Be very direct: clear conclusions and advice; minimal softening.',
};

const HUMOR: Record<Humor, string> = {
  off: 'Avoid jokes. Keep it serious and respectful.',
  light: 'Use light humor occasionally, very carefully.',
  normal:
    'Use noticeable humor, but always respectful and situation-appropriate.',
};

const SARCASM: Record<Sarcasm, string> = {
  off: 'No sarcasm or teasing.',
  light: 'Very mild teasing sometimes, only if clearly safe and friendly.',
  normal: 'Sarcasm like between friends, but never insulting or dismissive.',
  sarcastic:
    'More sarcastic for those who enjoy it; never cruel, never disrespectful.',
};

const PHRASE: Record<PhraseOfTheDay, string> = {
  on: "Include one short, casual 'phrase of the day' / life-hack naturally when appropriate. Do not force it.",
  off: "Do not add a 'phrase of the day'.",
};

const DELIVERY: Record<Delivery, string> = {
  straight: 'Be straightforward: what to do, minimal explanation.',
  explanations: 'Add a short explanation: why and how it works.',
  examples: 'Include simple examples of how it looks in practice.',
  metaphors:
    'Use metaphors/imagery to explain ideas creatively (keep it clear).',
};

const MIRRORING: Record<Mirroring, string> = {
  low: "Keep a stable voice; do not strongly mirror the user's style.",
  normal: 'Lightly adapt vocabulary/length/emotionality to the user.',
  high: "Strongly mirror the user's style (vocabulary, length, emotionality), while staying respectful.",
};

const CHALLENGE: Record<Challenge, string> = {
  none: 'Do not challenge the user; focus on support and validation.',
  gentle: 'Gently challenge avoidance or self-deception with care and empathy.',
  strong:
    'Challenge more strongly: call out avoidance directly, but without disrespect.',
};

const SENSITIVITY: Record<Sensitivity, string> = {
  very_gentle:
    'Be as cautious as possible: use soft wording, offer more support, and minimize harsh conclusions.',
  balanced:
    'Balanced sensitivity: supportive + honest; careful wording on sensitive topics.',
  friend_like:
    'Friend-like sensitivity: simpler, livelier language, but still considerate on sensitive topics.',
};

const USED_RULES: Rule[] = [
  {
    key: 'role',
    label: 'Role',
    meaning: 'relationship stance',
    explain: (v: Role) => ROLE[v],
  },
  {
    key: 'tone',
    label: 'Emotional tone',
    meaning: 'voice/temperament',
    explain: (v: Tone) => TONE[v],
  },
  {
    key: 'sensitivity',
    label: 'Sensitivity',
    meaning: 'care with fragile topics',
    explain: (v: Sensitivity) => SENSITIVITY[v],
  },
  {
    key: 'directness',
    label: 'Directness',
    meaning: 'how blunt advice is',
    explain: (v: Directness) => DIRECTNESS[v],
  },
  {
    key: 'challenge',
    label: 'Challenge',
    meaning: 'how much to push',
    explain: (v: Challenge) => CHALLENGE[v],
  },
  {
    key: 'mirroring',
    label: 'Mirroring',
    meaning: 'adapt to user style',
    explain: (v: Mirroring) => MIRRORING[v],
  },
  {
    key: 'humor',
    label: 'Humor',
    meaning: 'joke intensity',
    explain: (v: Humor) => HUMOR[v],
  },
  {
    key: 'sarcasm',
    label: 'Sarcasm',
    meaning: 'irony/teasing level',
    explain: (v: Sarcasm) => SARCASM[v],
  },
  {
    key: 'length',
    label: 'Response length',
    meaning: 'verbosity',
    explain: (v: Length) => LENGTH[v],
  },
  {
    key: 'depth',
    label: 'Depth',
    meaning: 'analysis depth',
    explain: (v: Depth) => DEPTH[v],
  },
  {
    key: 'delivery',
    label: 'Delivery',
    meaning: 'how to explain',
    explain: (v: Delivery) => DELIVERY[v],
  },
  {
    key: 'phraseOfTheDay',
    label: 'Phrase of the day',
    meaning: 'daily tip inclusion',
    explain: (v: PhraseOfTheDay) => PHRASE[v],
  },
];

function pickUsedStyle(style: ResponseStyle): UsedStyle {
  return {
    role: style.role,
    tone: style.tone,
    sensitivity: style.sensitivity,
    directness: style.directness,
    challenge: style.challenge,
    mirroring: style.mirroring,
    humor: style.humor,
    sarcasm: style.sarcasm,
    length: style.length,
    depth: style.depth,
    delivery: style.delivery,
    phraseOfTheDay: style.phraseOfTheDay,
  };
}

/**
 * Future-proof: later you can apply mode-specific overrides here
 * (entry/dialog), without changing callers.
 */
function resolveStyleForMode(
  prefs: AiPreferences,
  _mode: AiContextMode,
): UsedStyle {
  // For now: single style.
  // Later: if you decide to use prefs.entryStyle / prefs.dialogStyle,
  // apply overrides here.
  return pickUsedStyle(prefs.style);
}

export function buildAiPreferencesInstruction(params: {
  prefs: AiPreferences;
  mode?: AiContextMode;
}): string {
  const { prefs, mode = 'generic' } = params;

  const s = resolveStyleForMode(prefs, mode);
  const preset = prefs.preset ?? null;

  const lines: string[] = [];
  lines.push(
    'Follow these Tone & Style preferences unless they conflict with higher-priority safety rules.',
  );
  lines.push(`Preset: ${preset ?? 'custom'}.`);

  for (const r of USED_RULES) {
    if (mode === 'dialog' && r.key === 'phraseOfTheDay') continue;
    const value = s[r.key];
    lines.push(
      `${r.label} (${r.meaning}): ${String(value)}. ${r.explain(value)}`,
    );
  }

  return `${lines.join('\n- ')}`;
}
