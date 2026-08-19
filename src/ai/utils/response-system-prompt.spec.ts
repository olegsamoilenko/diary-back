import { describe, expect, it } from '@jest/globals';
import { DEFAULT_AI_PREFERENCES } from '../ai-preferences.defaults';
import { buildAiPreferencesInstruction } from './ai-preferences.prompt';
import { buildResponseSystemPrompt } from './response-system-prompt';

const base = {
  userName: 'Oleh',
  timeContext: {
    timeZone: 'Europe/Kyiv',
    nowLocalText: '2026-08-08 12:00',
    locale: 'uk-UA',
  },
  contextProtocol: 'memory_capsules_v2' as const,
  aboutMe: 'About user',
  metricsBlock: 'Metrics',
  goalsPrompt: 'Goals',
  stylesBlock:
    "Key thought: on. Include one short, casual 'key thought' / life-hack naturally when appropriate. Do not force it.",
  languageBlock: 'Answer in Ukrainian.',
  dialogResponseDiscipline: 'Maximum 2000 characters.',
  isFirstEntry: false,
};

describe('buildResponseSystemPrompt', () => {
  it('keeps key thought enabled by default and sends it to every mode', () => {
    expect(DEFAULT_AI_PREFERENCES.style.phraseOfTheDay).toBe('on');

    for (const mode of [
      'entry',
      'dialog',
      'checkin',
      'checkin_dialog',
    ] as const) {
      expect(
        buildAiPreferencesInstruction({
          prefs: DEFAULT_AI_PREFERENCES,
          mode,
        }),
      ).toContain('Key thought (daily tip inclusion): on.');
    }
  });

  it('requires maximum humor and sarcasm when context is safe in every mode', () => {
    const preferences = {
      ...DEFAULT_AI_PREFERENCES,
      style: {
        ...DEFAULT_AI_PREFERENCES.style,
        humor: 'normal' as const,
        sarcasm: 'sarcastic' as const,
      },
    };

    for (const mode of [
      'entry',
      'dialog',
      'checkin',
      'checkin_dialog',
    ] as const) {
      const stylesBlock = buildAiPreferencesInstruction({
        prefs: preferences,
        mode,
      });
      const prompt = buildResponseSystemPrompt({
        ...base,
        mode,
        stylesBlock,
        generateShortReflection: mode === 'entry' || mode === 'checkin',
      });

      expect(prompt).toContain(
        'Use clearly noticeable humor when the context is safe',
      );
      expect(prompt).toContain(
        'Use clearly noticeable, friendly sarcasm and irony when the context is safe',
      );
      expect(prompt).toContain(
        'Treat the selected levels as behavioral requirements, not optional descriptors',
      );
      expect(prompt).toContain('When the current material is clearly negative');
    }
  });

  it('requires informal singular user address in every mode and context protocol', () => {
    for (const contextProtocol of ['memory_capsules_v2' as const, undefined]) {
      for (const mode of [
        'entry',
        'dialog',
        'checkin',
        'checkin_dialog',
      ] as const) {
        const prompt = buildResponseSystemPrompt({
          ...base,
          contextProtocol,
          mode,
          generateShortReflection: mode === 'entry' || mode === 'checkin',
        });

        expect(prompt).toContain('**INFORMAL USER ADDRESS (HARD RULE):**');
        expect(prompt).toContain(
          'Always address the user in the informal singular second person',
        );
        expect(prompt).toContain('"ти", "тебе", "тобі"');
        expect(prompt).toContain('Never use "ви", "вас", "вам"');
        expect(prompt).toContain(
          '"ти з керівником", "ви обоє", or "ваша команда"',
        );
        expect(
          prompt.match(/\*\*INFORMAL USER ADDRESS \(HARD RULE\):\*\*/g),
        ).toHaveLength(1);
      }
    }
  });

  it('turns response length into mode-specific maximum ceilings only', () => {
    const expected = {
      entry: { short: 600, max: 2500, target: 'fullText' },
      checkin: { short: 600, max: 2000, target: 'fullText' },
      dialog: { short: 1000, max: 2000, target: 'the entire reply' },
      checkin_dialog: {
        short: 750,
        max: 1500,
        target: 'the entire reply',
      },
    } as const;

    for (const [mode, limits] of Object.entries(expected) as [
      keyof typeof expected,
      (typeof expected)[keyof typeof expected],
    ][]) {
      const shortInstruction = buildAiPreferencesInstruction({
        prefs: {
          ...DEFAULT_AI_PREFERENCES,
          style: { ...DEFAULT_AI_PREFERENCES.style, length: 'short' },
        },
        mode,
      });
      const detailedInstruction = buildAiPreferencesInstruction({
        prefs: {
          ...DEFAULT_AI_PREFERENCES,
          style: { ...DEFAULT_AI_PREFERENCES.style, length: 'detailed' },
        },
        mode,
      });

      expect(shortInstruction).toContain(
        `Keep ${limits.target} at or below ${limits.short} characters`,
      );
      expect(detailedInstruction).toContain(
        `never exceed ${limits.max} characters`,
      );
      expect(detailedInstruction).toContain(
        'The limit is a ceiling, not a target',
      );
      expect(detailedInstruction).not.toMatch(/\d+–\d+-character range/);

      const normalInstruction = buildAiPreferencesInstruction({
        prefs: DEFAULT_AI_PREFERENCES,
        mode,
      });
      expect(normalInstruction).toContain(
        `never exceed ${limits.max} characters`,
      );
      expect(normalInstruction).toContain('not a target or a preferred length');
      expect(normalInstruction).not.toMatch(/\d+–\d+-character range/);
    }
  });

  it('uses hard ceilings without minimum targets for entries', () => {
    const prompt = buildResponseSystemPrompt({
      ...base,
      mode: 'entry',
      generateShortReflection: true,
    });

    expect(prompt).toContain('shortText: never more than 600 characters');
    expect(prompt).toContain(
      'clearly explain the central mechanism behind the current situation or problem',
    );
    expect(prompt).toContain(
      'Do not use shortText to summarize the event, merely name a pattern, or jump directly to advice',
    );
    expect(prompt).toContain(
      'what triggers the response, what short-term function it serves, and what consequence keeps the problem going',
    );
    expect(prompt).toContain('fullText: never more than 2500 characters');
    expect(prompt).toContain('Character limits are ceilings, never targets');
    expect(prompt).not.toContain('1800–3000 characters');
    expect(prompt).not.toMatch(/(?:normally|usually|maximum).*\bwords?\b/i);
    expect(prompt.match(/"shortText": "\.\.\."/g)).toHaveLength(1);
  });

  it('uses check-in-specific character limits without duplicating the output contract', () => {
    const prompt = buildResponseSystemPrompt({
      ...base,
      mode: 'checkin',
      generateShortReflection: true,
    });

    expect(prompt).toContain('shortText: never more than 600 characters');
    expect(prompt).toContain('fullText: never more than 2000 characters');
    expect(prompt).not.toContain('1400–2300 characters');
    expect(prompt.match(/Return exactly one valid JSON object/g)).toHaveLength(
      1,
    );
  });

  it('renders the assembled memory-context instructions on the backend', () => {
    const prompt = buildResponseSystemPrompt({
      ...base,
      mode: 'entry',
      generateShortReflection: true,
    });

    expect(prompt).toContain('one system message marked [MEMORY_CAPSULES_V2]');
    expect(prompt).toContain('NEMORY_LONG_TERM_MEMORY_FROM_REFLECTION');
    expect(prompt).toContain('They are not summaries of that response');
    expect(prompt).toContain('[LONG_TERM_USER_MEMORY]');
    expect(prompt).toContain(
      'The current diary entry is the later user message beginning with',
    );
    expect(prompt).not.toContain('Do not expect separate user-memory');
    expect(prompt).toContain('MANDATORY CROSS-DOMAIN SEARCH');
    expect(prompt).toContain('MANDATORY CROSS-DOMAIN OUTPUT GATE');
    expect(prompt).toContain(
      'using 3 or 4 concrete examples from distinct other life domains',
    );
    expect(prompt).not.toContain('CALENDAR WORDING FOR DATED CONTEXT');
  });

  it('renders the separate legacy context map without version labels', () => {
    const prompt = buildResponseSystemPrompt({
      ...base,
      mode: 'entry',
      contextProtocol: undefined,
      generateShortReflection: true,
    });

    expect(prompt).toContain(
      'memory context, when supplied, may arrive in separate messages',
    );
    expect(prompt).toContain('[USER_MEMORY]');
    expect(prompt).toContain('[ASSISTANT_MEMORY]');
    expect(prompt).toContain('[ASSISTANT_COMMITMENTS]');
    expect(prompt).not.toContain('CONTEXT PROTOCOL — LEGACY');
    expect(prompt).not.toContain('MEMORY CAPSULES V2');
  });

  it('restores longitudinal memory analysis without the other isolated sections', () => {
    const prompt = buildResponseSystemPrompt({
      ...base,
      mode: 'entry',
      generateShortReflection: true,
    });

    expect(prompt).not.toContain('CALENDAR WORDING FOR DATED CONTEXT');
    expect(prompt).not.toContain('ACTIVE COMMITMENTS AND NEW PROMISES');
    expect(prompt).not.toContain('NON-TEMPLATED OPENINGS');
    expect(prompt).toContain('Inspect the complete supplied context');
    expect(prompt).toContain('long-term user memory from every life domain');
    expect(prompt).toContain('MANDATORY CROSS-DOMAIN SEARCH');
    expect(prompt).toContain('MANDATORY CROSS-DOMAIN OUTPUT GATE');
    expect(prompt).toContain(
      'using 3 or 4 concrete examples from distinct other life domains',
    );
    expect(prompt).not.toContain('Попугай');
    expect(prompt).not.toContain('DIARY ENTRY REFLECTION METHOD');
    expect(prompt).not.toContain('GROUNDING, QUALITY, AND VOICE');
  });

  it('recognizes exact soniac-prefixed developer messages in every mode', () => {
    for (const mode of [
      'entry',
      'dialog',
      'checkin',
      'checkin_dialog',
    ] as const) {
      const prompt = buildResponseSystemPrompt({
        ...base,
        mode,
        generateShortReflection: mode === 'entry' || mode === 'checkin',
      });

      expect(prompt).toContain('DEVELOPER MESSAGE MARKER (HARD RULE)');
      expect(prompt).toContain('exact lowercase standalone word "soniac"');
      expect(prompt).toContain(
        'the speaker is the developer of this application',
      );
      expect(prompt).toContain(
        'instead of treating it as diary material or performing a psychological reflection',
      );
      expect(prompt).toContain(
        'Similar words or a later occurrence do not activate developer mode',
      );
    }
  });

  it('adds depth-without-retelling rules after style preferences only to reflections', () => {
    for (const mode of ['entry', 'checkin'] as const) {
      const prompt = buildResponseSystemPrompt({
        ...base,
        mode,
        generateShortReflection: true,
      });

      expect(prompt).toContain(
        '**DEPTH WITHOUT RETELLING:**',
      );
      expect(prompt).toContain('Assume the user remembers what they wrote');
      expect(prompt).toContain('No paragraph may exist mainly to recap');
      expect(prompt).toContain(
        'Do not optimize for the shortest possible answer',
      );
      expect(prompt).toContain(
        'never remove necessary reasoning merely to make the response shorter',
      );
      expect(prompt).toContain(
        'Preserve the selected role, humor, sarcasm, and key-thought behavior',
      );
      expect(prompt.indexOf('Key thought: on')).toBeLessThan(
        prompt.indexOf('**DEPTH WITHOUT RETELLING:**'),
      );
    }

    for (const mode of ['dialog', 'checkin_dialog'] as const) {
      const prompt = buildResponseSystemPrompt({
        ...base,
        mode,
        generateShortReflection: false,
      });
      expect(prompt).not.toContain(
        '**DEPTH WITHOUT RETELLING:**',
      );
    }
  });

  it('also comments out extended calendar guidance for separate legacy context', () => {
    const prompt = buildResponseSystemPrompt({
      ...base,
      contextProtocol: undefined,
      mode: 'entry',
      generateShortReflection: true,
    });

    expect(prompt).not.toContain('CALENDAR WORDING FOR DATED CONTEXT');
    expect(prompt).not.toContain('use "yesterday" or "tomorrow"');
  });

  it('keeps key-thought authority in preferences for all modes', () => {
    for (const mode of [
      'entry',
      'dialog',
      'checkin',
      'checkin_dialog',
    ] as const) {
      const prompt = buildResponseSystemPrompt({
        ...base,
        mode,
        generateShortReflection: mode === 'entry' || mode === 'checkin',
      });

      expect(prompt).toContain('Key thought: on');
      expect(prompt).not.toContain('Never use "key thought"');
      expect(prompt).not.toContain('no "key thought"');
    }
  });

  it('comments out dialog-method and shared-quality instructions', () => {
    const prompt = buildResponseSystemPrompt({
      ...base,
      mode: 'dialog',
      generateShortReflection: false,
    });

    expect(prompt).not.toContain('Ask at most one follow-up question');
    expect(prompt).not.toContain('DIARY ENTRY DIALOG METHOD');
    expect(prompt).not.toContain('GROUNDING, QUALITY, AND VOICE');
  });

  it('keeps only the mode-specific current-item marker from date guidance', () => {
    for (const mode of [
      'entry',
      'dialog',
      'checkin',
      'checkin_dialog',
    ] as const) {
      const prompt = buildResponseSystemPrompt({
        ...base,
        mode,
        generateShortReflection: mode === 'entry' || mode === 'checkin',
      });

      expect(prompt).toContain(
        mode === 'entry' || mode === 'dialog'
          ? 'Current journal entry (YYYY-MM-DD HH:MM):'
          : 'Current check-in (YYYY-MM-DD HH:MM):',
      );
      expect(prompt).not.toContain("current item's saved calendar day");
      expect(prompt).not.toContain('earlier that day');
    }
  });

  it('keeps the reusable instruction prefix ahead of changing time data', () => {
    const first = buildResponseSystemPrompt({
      ...base,
      mode: 'dialog',
      generateShortReflection: false,
    });
    const second = buildResponseSystemPrompt({
      ...base,
      userName: 'Another name',
      timeContext: {
        ...base.timeContext,
        nowLocalText: '2026-08-08 12:10',
      },
      mode: 'dialog',
      generateShortReflection: false,
    });
    const dynamicMarker = '**CURRENT USER AND TIME CONTEXT:**';

    expect(first.slice(0, first.indexOf(dynamicMarker))).toBe(
      second.slice(0, second.indexOf(dynamicMarker)),
    );
    expect(
      first.indexOf('**MEMORY CONTEXT AND LONGITUDINAL REASONING'),
    ).toBeLessThan(first.indexOf(dynamicMarker));
    expect(first).not.toContain('**DIARY ENTRY DIALOG METHOD:**');
  });

  it('keeps volatile current time out of the cacheable dialog system prompt', () => {
    const prompt = buildResponseSystemPrompt({
      ...base,
      mode: 'dialog',
      generateShortReflection: false,
    });

    expect(prompt).toContain('- timeZone: Europe/Kyiv');
    expect(prompt).toContain('- locale: uk-UA');
    expect(prompt).not.toContain('nowLocalText: 2026-08-08 12:00');
  });

  it('keeps current time in non-dialog reflection prompts', () => {
    const prompt = buildResponseSystemPrompt({
      ...base,
      mode: 'entry',
      generateShortReflection: true,
    });

    expect(prompt).toContain('- nowLocalText: 2026-08-08 12:00');
  });

  it('comments out the backdated-item interpretation during the experiment', () => {
    for (const mode of [
      'entry',
      'dialog',
      'checkin',
      'checkin_dialog',
    ] as const) {
      const prompt = buildResponseSystemPrompt({
        ...base,
        mode,
        generateShortReflection: mode === 'entry' || mode === 'checkin',
      });

      expect(prompt).not.toContain(
        'may intentionally be in the past and differ from the current request time',
      );
      expect(prompt).not.toContain('do not replace it with nowLocalText');
    }
  });

  it('tells every response mode that exact one-time app reminders are available', () => {
    for (const mode of [
      'entry',
      'dialog',
      'checkin',
      'checkin_dialog',
    ] as const) {
      const prompt = buildResponseSystemPrompt({
        ...base,
        mode,
        generateShortReflection: mode === 'entry' || mode === 'checkin',
      });

      expect(prompt).toContain('**EXACT ONE-TIME APP REMINDERS:**');
      expect(prompt).toContain(
        'Never tell the user that you cannot send notifications or reminders',
      );
      expect(prompt).toContain(
        'This capability currently supports one-time reminders only',
      );
      expect(prompt).toContain(
        mode === 'entry' || mode === 'checkin'
          ? 'include the acceptance in both versions'
          : 'Put the confirmation directly in the plain-text answer',
      );
    }
  });
});
