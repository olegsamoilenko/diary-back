import { afterAll, describe, expect, it } from '@jest/globals';
import { get_encoding } from 'tiktoken';
import { AiService } from '../ai.service';
import { DEFAULT_AI_PREFERENCES } from '../ai-preferences.defaults';
import { CONVERSATION_TASK } from '../conversation/conversation.context';
import { buildPeriodicAnalysisTask } from '../periodic-analysis/periodic-analysis.prompt';
import { NEMORY_COMMON_INSTRUCTIONS } from './journal-response-instructions';
import { buildResponseSystemPromptParts } from './response-system-prompt';

describe('one common response block including service data and styles', () => {
  const enc = get_encoding('o200k_base');
  afterAll(() => enc.free());
  const ai = Object.create(AiService.prototype);
  const base = {
    userName: 'Олег',
    timeContext: {
      timeZone: 'Europe/Kiev',
      locale: 'uk',
      nowLocalText: '2026-10-01 20:00',
    },
    aboutMe:
      'Працюю над власним застосунком. Хочу краще розуміти свої реакції та знаходити баланс між роботою і відпочинком.',
    goalsPrompt: '',
    metricsBlock: '',
    isFirstEntry: false,
    generateShortReflection: true,
  };

  it.each(['short', 'normal', 'detailed'] as const)(
    'fits 2500 o200k tokens including all styles (%s), identity, language and request time',
    async (length) => {
      ai.aiPreferencesService = {
        getForUser: async () => ({
          prefsJson: {
            ...DEFAULT_AI_PREFERENCES,
            style: {
              ...DEFAULT_AI_PREFERENCES.style,
              length,
              role: 'therapeutic',
              sensitivity: 'very_gentle',
              sarcasm: 'sarcastic',
            },
          },
        }),
      };
      const stylesBlock = await ai.getStylesBlock(1, 'entry', {
        compact: 'minimal',
        includeLengthExecution: false,
      });
      const data = {
        ...base,
        stylesBlock,
        languageBlock: ai.buildLanguageBlock('uk'),
      };
      const modes = ['entry', 'checkin', 'dialog', 'checkin_dialog'] as const;
      const parts = modes.map((mode) =>
        buildResponseSystemPromptParts({ ...data, mode }),
      );
      for (const kind of ['day', 'week', 'month', 'year'] as const) {
        parts.push(
          buildResponseSystemPromptParts({
            ...data,
            mode: 'entry',
            task: buildPeriodicAnalysisTask(kind),
          }),
        );
      }
      parts.push(
        buildResponseSystemPromptParts({
          ...data,
          mode: 'dialog',
          task: CONVERSATION_TASK,
        }),
      );
      for (const part of parts) {
        expect(part.stablePrefix).toBe(parts[0].stablePrefix);
        expect(
          part.stablePrefix.split(NEMORY_COMMON_INSTRUCTIONS),
        ).toHaveLength(2);
        expect(part.dynamicSuffix).not.toContain(NEMORY_COMMON_INSTRUCTIONS);
        expect(
          enc.encode(
            part.stablePrefix +
              '\n\nRequest time: ' +
              base.timeContext.nowLocalText +
              '.',
          ).length,
        ).toBeLessThanOrEqual(2500);
        expect(part.stablePrefix).toContain(base.aboutMe);
        expect(part.stablePrefix).toContain(stylesBlock);
        expect(stylesBlock.split('\n')).toHaveLength(13); // heading + 12 live settings
      }
      const later = buildResponseSystemPromptParts({
        ...data,
        mode: 'dialog',
        timeContext: { ...base.timeContext, nowLocalText: '2026-10-02 09:00' },
      });
      expect(later.stablePrefix).toBe(parts[0].stablePrefix);
    },
  );

  it('does not silently trim long user data to meet an instruction budget', () => {
    const aboutMe = 'Важливі відомості користувача. '.repeat(400);
    const part = buildResponseSystemPromptParts({
      ...base,
      aboutMe,
      mode: 'entry',
      stylesBlock: '',
      languageBlock: ai.buildLanguageBlock(null),
    });
    expect(part.stablePrefix).toContain(aboutMe.trim());
    expect(enc.encode(part.stablePrefix).length).toBeGreaterThan(2500);
    expect(part.stablePrefix).not.toContain('do not know Russian');
  });
});
