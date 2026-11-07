import { afterAll, describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get_encoding } from 'tiktoken';
import { NEMORY_COMMON_INSTRUCTIONS } from './journal-response-instructions';
import { buildNemoryCapabilitiesPrompt } from './nemory-capabilities';
import {
  buildResponseLanguageBlock,
  buildResponseSystemPrompt,
  buildResponseSystemPromptParts,
  refreshSavedResponseInstructions,
  withResponseLanguageReminder,
} from './response-system-prompt';
import { buildAiPreferencesInstruction } from './ai-preferences.prompt';
import { DEFAULT_AI_PREFERENCES } from '../ai-preferences.defaults';
import { buildConversationTask } from '../conversation/conversation.context';
import {
  buildPeriodicAnalysisTask,
  buildPeriodicAnalysisDialogTask,
} from '../periodic-analysis/periodic-analysis.prompt';
import {
  imageGenerationInstructions,
  stripImageGenerationInstructions,
} from '../media/image-generation.policy';
import { WEB_SEARCH_INSTRUCTIONS, WEB_SEARCH_UNAVAILABLE_INSTRUCTIONS } from '../web-search/web-search';
import { AiProvider } from '../types/providers';
import { providerPromptTokenCounts } from './prompt-token-breakdown';
import type { OpenAiMessage } from '../types';

const history = resolve(
  __dirname,
  '../../..',
  'docs/prompt-history/20261106-compaction',
);
const baseline = JSON.parse(
  readFileSync(resolve(history, 'psychology-verbatim.json'), 'utf8'),
) as { commonBlocks: string[]; plannerParagraph: string };
const enc = get_encoding('o200k_base');
afterAll(() => enc.free());
const count = (s: string) => enc.encode(s).length;
// UUIDs vary in token length. Use a 34-token marker plus two reserved tokens,
// so budget acceptance does not depend on a randomly cheap generated UUID.
const budgetCount = (s: string) => {
  let markers = 0;
  const normalized = s.replace(/\[\[NEMORY_CREATE:[0-9a-f-]{36}\]\]/g, () => {
    markers++;
    return '[[NEMORY_CREATE:a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0]]';
  });
  return count(normalized) + markers * 2;
};
const prefs = {
  ...DEFAULT_AI_PREFERENCES,
  style: {
    ...DEFAULT_AI_PREFERENCES.style,
    role: 'therapeutic' as const,
    sensitivity: 'very_gentle' as const,
    sarcasm: 'sarcastic' as const,
  },
};
const base = {
  userName: 'Олег',
  timeContext: {
    timeZone: 'Europe/Kiev',
    locale: 'uk',
    nowLocalText: '2026-11-06 09:00',
  },
  aboutMe: '',
  metricsBlock: '',
  goalsPrompt: '',
  isFirstEntry: false,
  generateShortReflection: true,
  imageGeneration: true,
  imageReferences: true,
  imageActions: true,
  plannerCreation: true,
  reminderRecurrence: true,
  languageBlock: buildResponseLanguageBlock('Ukrainian'),
  stylesBlock:
    'USER TONE AND STYLE PREFERENCES\n' +
    buildAiPreferencesInstruction({
      prefs,
      compact: 'minimal',
      includeLengthExecution: false,
    }),
};

describe('reviewed prompt compaction', () => {
  it.each(['uk', 'en', 'pl', 'de'])('keeps every localized %s mode within 3000, including provider and feature instructions', uiLocale => {
    for (const mode of ['entry', 'checkin', 'dialog', 'checkin_dialog', 'conversation', 'day', 'week', 'month', 'year'] as const) {
      const periodic = ['day', 'week', 'month', 'year'].includes(mode);
      const period = mode as 'day' | 'week' | 'month' | 'year';
      const p = { ...base, uiLocale, mode: periodic ? 'entry' as const : mode === 'conversation' ? 'dialog' as const : mode as 'entry' | 'checkin' | 'dialog' | 'checkin_dialog', isFirstEntry: true, visibleResponseTokens: 1300,
        ...(periodic ? { task: buildPeriodicAnalysisTask(period, 4500) } : mode === 'conversation' ? { task: buildConversationTask(1200) } : {}) };
      const parts = buildResponseSystemPromptParts(p);
      const messages: OpenAiMessage[] = [{ role: 'system', content: parts.stablePrefix }, { role: 'user', content: `[RESPONSE_TASK]\n${parts.dynamicSuffix}\n[/RESPONSE_TASK]` }, { role: 'user', content: 'Тест' }, { role: 'system', content: WEB_SEARCH_INSTRUCTIONS }];
      if (periodic) messages.splice(1, 0, { role: 'system', content: buildPeriodicAnalysisDialogTask(period, 1200) });
      expect(providerPromptTokenCounts(withResponseLanguageReminder(messages, AiProvider.QWEN, p.languageBlock), budgetCount).instructionsAndSystemData).toBeLessThanOrEqual(3000);
    }
  });
  it.each(['entry', 'checkin', 'dialog', 'checkin_dialog'] as const)('keeps legacy %s instructions within budget without unavailable capabilities', mode => {
    const prompt = buildResponseSystemPrompt({ ...base, mode, isFirstEntry: true, plannerCreation: false, reminderRecurrence: false });
    const messages: OpenAiMessage[] = [
      { role: 'system', content: prompt },
      { role: 'system', content: WEB_SEARCH_UNAVAILABLE_INSTRUCTIONS },
      { role: 'user', content: 'Тест' },
    ];
    expect(providerPromptTokenCounts(withResponseLanguageReminder(messages, AiProvider.QWEN, base.languageBlock), budgetCount).instructionsAndSystemData).toBeLessThanOrEqual(3000);
    expect(prompt).not.toContain('[[NEMORY_CREATE:');
  });
  it('preserves every protected psychological paragraph byte for byte', () => {
    for (const block of [...baseline.commonBlocks, baseline.plannerParagraph])
      expect(NEMORY_COMMON_INSTRUCTIONS).toContain(block);
  });
  it('refreshes recognized saved report instructions once without changing request data/task', () => {
    const saved =
      'NEMORY RESPONSE RULES v3\nold psychological rules\n\nNEMORY SHARED CAPABILITIES\nold capabilities\n\nREQUEST DATA\nUser name: Synthetic\n\nTASK — DAY ANALYSIS\nOriginal task';
    const updated = refreshSavedResponseInstructions(saved);
    expect(updated).toContain(
      'REQUEST DATA\nUser name: Synthetic\n\nTASK — DAY ANALYSIS\nOriginal task',
    );
    expect(updated.split(NEMORY_COMMON_INSTRUCTIONS)).toHaveLength(2);
    expect(updated.split(buildNemoryCapabilitiesPrompt())).toHaveLength(2);
    expect(refreshSavedResponseInstructions(updated)).toBe(updated);
    expect(saved).toContain('old psychological rules');
    expect(refreshSavedResponseInstructions('unknown legacy format')).toBe(
      'unknown legacy format',
    );
  });
  it('keeps modern and older image-action contracts and removes saved image instructions cleanly', () => {
    const modern = imageGenerationInstructions(true, true);
    expect(modern).toContain('action=generate');
    expect(modern).toContain('action=offer');
    expect(modern).toContain('referenceIds');
    const older = imageGenerationInstructions(false, false);
    expect(older).toContain('confirmation button');
    expect(older).not.toContain('"action":"generate"');
    expect(older).toContain('cannot edit supplied photos');
    expect(stripImageGenerationInstructions('prefix' + modern + 'suffix')).toBe(
      'prefixsuffix',
    );
    const oldSource = readFileSync(
      resolve(history, 'media__image-generation.policy.ts.before.txt'),
      'utf8',
    );
    expect(oldSource).toContain('never shortText or outside JSON.');
  });
  it('logs final instruction, question and context text without hiding web/Qwen additions', () => {
    const messages: OpenAiMessage[] = [
      { role: 'system', content: 'Rules' },
      { role: 'user', content: '[RESPONSE_TASK]\nTask\n[/RESPONSE_TASK]' },
      { role: 'user', content: 'Synthetic source' },
      { role: 'system', content: WEB_SEARCH_INSTRUCTIONS },
    ];
    const withLanguage = withResponseLanguageReminder(
      messages,
      AiProvider.QWEN,
      base.languageBlock,
    );
    const tokens = providerPromptTokenCounts(withLanguage, count);
    expect(tokens.totalText).toBe(
      withLanguage.reduce((n, m) => n + count(m.content), 0),
    );
    expect(tokens.instructionsAndSystemData).toBeGreaterThan(
      providerPromptTokenCounts(messages, count).instructionsAndSystemData,
    );
    expect(JSON.stringify(tokens)).not.toContain('Synthetic source');
  });
  it.each(['entry', 'checkin', 'dialog', 'checkin_dialog'] as const)(
    'measures the complete %s instructions including first-response and provider variants',
    (mode) => {
      for (const first of mode.includes('dialog') ? [false] : [false, true]) {
        const p = {
          ...base,
          mode,
          isFirstEntry: first,
          visibleResponseTokens: mode.includes('dialog') ? 1200 : 1300,
        };
        const parts = buildResponseSystemPromptParts(p);
        const messages: OpenAiMessage[] = [
          { role: 'system', content: parts.stablePrefix },
          {
            role: 'user',
            content: `[RESPONSE_TASK]\n${parts.dynamicSuffix}\n[/RESPONSE_TASK]`,
          },
          { role: 'user', content: 'Тестовий зміст' },
          { role: 'system', content: WEB_SEARCH_INSTRUCTIONS },
        ];
        const tokens = providerPromptTokenCounts(
          withResponseLanguageReminder(
            messages,
            AiProvider.QWEN,
            p.languageBlock,
          ),
          budgetCount,
        );
        expect(tokens.instructionsAndSystemData).toBeLessThanOrEqual(3000);
      }
    },
  );
  it.each(['day', 'week', 'month', 'year', 'conversation'] as const)(
    'measures complete %s and summary-dialog instructions',
    (kind) => {
      const p = {
        ...base,
        mode:
          kind === 'conversation' ? ('dialog' as const) : ('entry' as const),
        task:
          kind === 'conversation'
            ? buildConversationTask(1200)
            : buildPeriodicAnalysisTask(kind, 4500),
      };
      const messages: OpenAiMessage[] = [
        { role: 'system', content: buildResponseSystemPrompt(p) },
        { role: 'system', content: WEB_SEARCH_INSTRUCTIONS },
        { role: 'user', content: 'Тестовий зміст' },
      ];
      if (kind !== 'conversation')
        messages.splice(1, 0, {
          role: 'system',
          content: buildPeriodicAnalysisDialogTask(kind, 1200),
        });
      expect(
        providerPromptTokenCounts(
          withResponseLanguageReminder(
            messages,
            AiProvider.QWEN,
            p.languageBlock,
          ),
          budgetCount,
        ).instructionsAndSystemData,
      ).toBeLessThanOrEqual(3000);
    },
  );
});
