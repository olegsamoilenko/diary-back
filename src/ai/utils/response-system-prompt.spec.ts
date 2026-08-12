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
  longitudinalResponseGuidance: 'Longitudinal guidance.',
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

  it('turns response length into mode-specific character targets', () => {
    const expected = {
      entry: { short: 1600, max: 3200, target: 'fullText' },
      checkin: { short: 1250, max: 2500, target: 'fullText' },
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
      if (mode === 'dialog') {
        expect(detailedInstruction).toContain(
          'Use the detailed 1650–1850-character range',
        );
      } else if (mode === 'checkin_dialog') {
        expect(detailedInstruction).toContain(
          'Use the detailed 1200–1400-character range',
        );
      } else {
        expect(detailedInstruction).toContain(
          `Target the full available ${limits.max}-character allowance for ${limits.target}`,
        );
      }
    }
  });

  it('uses character ranges and one shared structured output contract for entries', () => {
    const prompt = buildResponseSystemPrompt({
      ...base,
      mode: 'entry',
      generateShortReflection: true,
    });

    expect(prompt).toContain('600–1100 characters');
    expect(prompt).toContain('1800–3000 characters');
    expect(prompt).toContain('never more than 3200 characters');
    expect(prompt).not.toMatch(/(?:normally|usually|maximum).*\bwords?\b/i);
    expect(prompt.match(/"shortText": "\.\.\."/g)).toHaveLength(1);
  });

  it('uses check-in-specific character limits without duplicating the output contract', () => {
    const prompt = buildResponseSystemPrompt({
      ...base,
      mode: 'checkin',
      generateShortReflection: true,
    });

    expect(prompt).toContain('450–850 characters');
    expect(prompt).toContain('1400–2300 characters');
    expect(prompt).toContain('never more than 2500 characters');
    expect(prompt.match(/Return exactly one valid JSON object/g)).toHaveLength(
      1,
    );
  });

  it('describes V2 as one assembled memory context', () => {
    const prompt = buildResponseSystemPrompt({
      ...base,
      mode: 'entry',
      generateShortReflection: true,
    });

    expect(prompt).toContain('single assembled memory context');
    expect(prompt).toContain(
      'Do not expect separate profile, assistant-memory, commitment, or similar-entry blocks',
    );
    expect(prompt).toContain(
      'dated long-term Nemory memory extracted from earlier reflections',
    );
    expect(prompt).toContain(
      'not a compressed retelling of the earlier response',
    );
    expect(prompt).toContain(
      '[aggregated=true; firstSeenAt=...; lastSeenAt=...; occurrenceCount=N; evidenceCount=M]',
    );
    expect(prompt).toContain(
      'It is consolidated memory supported by M source observations describing N distinct real-world occurrences',
    );
    expect(prompt).toContain(
      'Treat it as a recurring pattern only when occurrenceCount is greater than 1',
    );
    expect(prompt).toContain(
      'evidenceCount greater than 1 does not by itself prove recurrence',
    );
    expect(prompt).toContain(
      'Do not treat an atomic item as recurring unless other dated evidence independently supports recurrence',
    );
    expect(prompt).toContain("item's actual saved creation date");
  });

  it('does not add the V2 aggregation contract to legacy prompts', () => {
    const prompt = buildResponseSystemPrompt({
      ...base,
      mode: 'entry',
      contextProtocol: undefined,
      generateShortReflection: true,
    });

    expect(prompt).not.toContain('aggregated=true');
    expect(prompt).not.toContain('occurrenceCount=N');
    expect(prompt).not.toContain('evidenceCount=M');
  });

  it('uses today, yesterday, and tomorrow around the saved V2 item date while keeping older dates concrete', () => {
    const prompt = buildResponseSystemPrompt({
      ...base,
      mode: 'entry',
      generateShortReflection: true,
    });

    expect(prompt).toContain('CONCRETE CALENDAR RELATION WORDING');
    expect(prompt).toContain(
      'saved calendar date of the current diary entry as the reference day',
    );
    expect(prompt).toContain('say "today"');
    expect(prompt).toContain('say "yesterday" or "tomorrow"');
    expect(prompt).toContain('"last week", "next week"');
    expect(prompt).toContain('"last month", "next month"');
    expect(prompt).toContain('"last year", "next year"');
    expect(prompt).toContain('an exact date such as "12 July"');
    expect(prompt).toContain(
      'Exact dates are appropriate when they are the clearest way to say when something happened',
    );
    expect(prompt).toContain(
      'Never reduce dated evidence to vague wording such as "this happened before"',
    );
    expect(prompt).not.toContain('Every spoken date must earn its place');
    expect(prompt).not.toContain('date-led opening');
  });

  it('does not add the V2 calendar relation rule to the legacy prompt', () => {
    const prompt = buildResponseSystemPrompt({
      ...base,
      contextProtocol: undefined,
      mode: 'entry',
      generateShortReflection: true,
    });

    expect(prompt).not.toContain('CONCRETE CALENDAR RELATION WORDING');
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

  it('allows at most one follow-up question in dialogs', () => {
    const prompt = buildResponseSystemPrompt({
      ...base,
      mode: 'dialog',
      generateShortReflection: false,
    });

    expect(prompt).toContain('Ask at most one follow-up question');
    expect(prompt.match(/at most one follow-up question/g)).toHaveLength(1);
    expect(prompt).not.toMatch(/one or two clear follow-up/i);
  });

  it('requires exact saved-date comparison before relative time wording in every mode', () => {
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
        'compare the explicit saved dates of the current item and the referenced memory',
      );
      expect(prompt).toContain(
        'never call an earlier same-day event "yesterday"',
      );
      expect(prompt).toContain('earlier that day');
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
    expect(first.indexOf('**DIARY ENTRY DIALOG METHOD:**')).toBeLessThan(
      first.indexOf(dynamicMarker),
    );
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

  it('treats a backdated item as belonging to its saved creation date', () => {
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
        'may intentionally be in the past and differ from the current request time',
      );
      expect(prompt).toContain('do not replace its date with nowLocalText');
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
