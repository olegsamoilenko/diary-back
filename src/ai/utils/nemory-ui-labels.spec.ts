import {
  buildNemoryCapabilitiesPrompt,
  nemoryUiLabels,
} from './nemory-capabilities';
import { NEMORY_UI_LABELS } from './nemory-ui-labels.generated';
import {
  buildResponseSystemPrompt,
  refreshSavedResponseInstructions,
} from './response-system-prompt';

describe('localized app navigation', () => {
  it.each(Object.keys(NEMORY_UI_LABELS))(
    'uses only exact %s UI labels in every manual path',
    (locale) => {
      const labels = nemoryUiLabels(locale);
      const prompt = buildNemoryCapabilitiesPrompt(true, true, locale);
      for (const value of Object.values(labels))
        expect(prompt).toContain(value);
      expect(prompt).toContain(
        `${labels.planner}→type→⋯→${labels.edit}/${labels.delete}/${labels.archive}`,
      );
      expect(prompt).toContain(
        `Repeat actions:MUST explain requested scope ${labels.single}(default)/${labels.following}/${labels.series}→confirm`,
      );
      if (locale !== 'en') {
        expect(prompt).not.toContain(NEMORY_UI_LABELS.en.cancelReminder);
        expect(prompt).not.toContain(NEMORY_UI_LABELS.en.series);
      }
    },
  );
  it.each(['uk-UA', 'UK_ua', ' uk '])(
    'normalizes %s like the app',
    (locale) => {
      expect(nemoryUiLabels(locale)).toBe(NEMORY_UI_LABELS.uk);
    },
  );
  it.each([null, undefined, '', 'fr', '__proto__', 'constructor'])(
    'uses the app English fallback for %s',
    (locale) => {
      expect(nemoryUiLabels(locale)).toBe(NEMORY_UI_LABELS.en);
    },
  );
  it('uses UI language independently from response language, and refreshes a saved report without altering its data', () => {
    const params = {
      mode: 'dialog' as const,
      uiLocale: 'pl',
      timeContext: { timeZone: 'Europe/Kiev', nowLocalText: '', locale: 'uk' },
      aboutMe: '',
      metricsBlock: '',
      goalsPrompt: '',
      stylesBlock: '',
      languageBlock: 'Configured response language: Ukrainian.',
      isFirstEntry: false,
      generateShortReflection: false,
    };
    const current = buildResponseSystemPrompt(params);
    expect(current).toContain(NEMORY_UI_LABELS.pl.cancelReminder);
    expect(current).toContain(params.languageBlock);
    const data =
      '\n\nREQUEST DATA\nUser profile with APP CAPABILITIES\nunchanged\nTASK\noriginal';
    const saved = buildNemoryCapabilitiesPrompt(true, true, 'en') + data;
    const refreshed = refreshSavedResponseInstructions(
      saved,
      false,
      false,
      'de',
    );
    expect(refreshed).toContain(
      buildNemoryCapabilitiesPrompt(false, false, 'de'),
    );
    expect(refreshed.endsWith(data)).toBe(true);
    expect(refreshed).not.toContain(NEMORY_UI_LABELS.en.cancelReminder);
    expect(
      refreshSavedResponseInstructions(refreshed, false, false, 'de'),
    ).toBe(refreshed);
    expect(saved).toContain(NEMORY_UI_LABELS.en.cancelReminder);
  });
});
import { describe, it, expect } from '@jest/globals';
