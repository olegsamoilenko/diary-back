import { readdir, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  rememberMemoryReviewProviderUsage,
  rememberMemoryReviewStep,
} from './memory-review-file-log';

jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn(() => Promise.resolve()),
  readdir: jest.fn(() => Promise.resolve([])),
  writeFile: jest.fn(() => Promise.resolve()),
}));

function writtenString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

describe('Memory V2 user review file', () => {
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.mocked(readdir).mockClear();
    jest.mocked(writeFile).mockClear();
  });

  it('writes one readable four-block report with provider usage', async () => {
    jest.useFakeTimers();
    const traceId = 'review-cycle-1';
    rememberMemoryReviewProviderUsage({
      traceId,
      operation: 'extract_user_memory_capsule_v2',
      model: 'gpt-5.6-luna',
      usageSource: 'provider_usage',
      estimated: false,
      finishReason: 'stop',
      tokensFromProvider: {
        inputTotal: 100,
        standardInput: 100,
        cacheReadInput: 0,
        cacheWriteInput: 0,
        output: 20,
        total: 120,
      },
      ratesPer1MTokens: {
        standardInput: 3000,
        cacheReadInput: 300,
        cacheWriteInput: 3750,
        output: 15000,
      },
      creditsByFormula: {
        standardInput: 0.3,
        cacheReadInput: 0,
        cacheWriteInput: 0,
        output: 0.3,
      },
      chargedCredits: { input: 1, output: 1, total: 2 },
    });
    rememberMemoryReviewProviderUsage({
      traceId,
      operation: 'generate_entry_response',
      model: 'gpt-5.6-terra',
      usageSource: 'provider_usage',
      estimated: false,
      finishReason: 'stop',
      tokensFromProvider: {
        inputTotal: 200,
        standardInput: 200,
        cacheReadInput: 0,
        cacheWriteInput: 0,
        output: 40,
        total: 240,
      },
      ratesPer1MTokens: {
        standardInput: 30000,
        cacheReadInput: 3000,
        cacheWriteInput: 37500,
        output: 150000,
      },
      creditsByFormula: {
        standardInput: 6,
        cacheReadInput: 0,
        cacheWriteInput: 0,
        output: 6,
      },
      chargedCredits: { input: 6, output: 6, total: 12 },
    });
    rememberMemoryReviewProviderUsage({
      traceId,
      operation: 'extract_assistant_memory_capsule_v2',
      model: 'gpt-5.6-luna',
      usageSource: 'provider_usage',
      estimated: false,
      finishReason: 'stop',
      tokensFromProvider: {
        inputTotal: 80,
        standardInput: 80,
        cacheReadInput: 0,
        cacheWriteInput: 0,
        output: 10,
        total: 90,
      },
      ratesPer1MTokens: {
        standardInput: 3000,
        cacheReadInput: 300,
        cacheWriteInput: 3750,
        output: 15000,
      },
      creditsByFormula: {
        standardInput: 0.24,
        cacheReadInput: 0,
        cacheWriteInput: 0,
        output: 0.15,
      },
      chargedCredits: { input: 1, output: 1, total: 2 },
    });

    rememberMemoryReviewStep({
      step: 1,
      title: 'extracted',
      sourceType: 'entry',
      traceId,
      sections: [
        { label: 'ТЕГИ', value: ['domain.work'] },
        { label: 'НОВІ ТЕГИ', value: [] },
      ],
    });
    rememberMemoryReviewStep({
      step: 1,
      title: 'extracted',
      sourceType: 'entry',
      traceId,
      sections: [
        { label: 'СТИСЛИЙ ПІДСУМОК ЗАПИСУ', value: 'Короткий підсумок' },
        {
          label: "НОВА ДОВГОТРИВАЛА ПАМ'ЯТЬ КОРИСТУВАЧА",
          value: [{ kind: 'goal', content: 'Завершити роботу' }],
        },
        {
          label: 'СИРИЙ JSON ПРОВАЙДЕРА · EXTRACT_USER_MEMORY_DETAILS_V2',
          value: {
            providerText: '{"userMemory":[]}',
            parsedJson: { userMemory: [] },
          },
          excludeFromUsage: true,
        },
        {
          label: 'ДІАГНОСТИКА НОРМАЛІЗАЦІЇ · USER MEMORY',
          value: {
            totalCandidateCount: 0,
            normalizedUserMemoryCount: 0,
          },
          excludeFromUsage: true,
        },
      ],
    });
    rememberMemoryReviewStep({
      step: 2,
      title: 'context',
      sourceType: 'entry',
      traceId,
      sections: [
        {
          label: 'ПОТОЧНИЙ ЗАПИС',
          value: { mood: 'good', text: 'Поточний текст' },
          tokenText: 'Current journal entry: Поточний текст',
        },
        {
          label: 'РЕЛЕВАНТНІ ПОПЕРЕДНІ ЗАПИСИ ТА ЧЕКІНИ',
          value: '[RELEVANT_PREVIOUS_ENTRIES]\n[/RELEVANT_PREVIOUS_ENTRIES]',
          tokenText:
            '[RELEVANT_PREVIOUS_ENTRIES]\n[/RELEVANT_PREVIOUS_ENTRIES]',
        },
        {
          label: 'АКТИВНІ ОБІЦЯНКИ NEMORY',
          value: '[ACTIVE_NEMORY_COMMITMENTS]\n[/ACTIVE_NEMORY_COMMITMENTS]',
          tokenText:
            '[ACTIVE_NEMORY_COMMITMENTS]\n[/ACTIVE_NEMORY_COMMITMENTS]',
        },
        {
          label: "ДОВГОТРИВАЛА ПАМ'ЯТЬ КОРИСТУВАЧА",
          value:
            '[LONG_TERM_USER_MEMORY]\n' +
            '- [aggregated=true; firstSeenAt=2026-07-12 21:50 Europe/Kiev; lastSeenAt=2026-07-13 21:52 Europe/Kiev; occurrenceCount=1; evidenceCount=2] Consolidated episode\n' +
            '[/LONG_TERM_USER_MEMORY]',
          tokenText:
            '[LONG_TERM_USER_MEMORY]\n' +
            '- [aggregated=true; firstSeenAt=2026-07-12 21:50 Europe/Kiev; lastSeenAt=2026-07-13 21:52 Europe/Kiev; occurrenceCount=1; evidenceCount=2] Consolidated episode\n' +
            '[/LONG_TERM_USER_MEMORY]',
        },
        {
          label: 'ПІДСУМОК MEMORY V2',
          value: null,
          tokenText: '[MEMORY_CAPSULES_V2]\n[/MEMORY_CAPSULES_V2]',
        },
      ],
    });
    rememberMemoryReviewStep({
      step: 3,
      title: 'response',
      sourceType: 'entry',
      traceId,
      sections: [
        { label: 'КОРОТКА РЕФЛЕКСІЯ', value: 'Коротко' },
        { label: 'ПОВНА РЕФЛЕКСІЯ', value: 'Повна відповідь' },
      ],
    });
    rememberMemoryReviewStep({
      step: 4,
      title: 'capsule',
      sourceType: 'entry',
      traceId,
      sections: [
        {
          label: "ДОВГОТРИВАЛА ПАМ'ЯТЬ NEMORY З РЕФЛЕКСІЇ",
          value: [{ kind: 'strategy', content: 'Розбити задачу' }],
        },
        { label: 'НОВІ ОБІЦЯНКИ NEMORY', value: [] },
        { label: 'ОНОВЛЕННЯ ОБІЦЯНОК', value: [] },
      ],
    });

    await jest.advanceTimersByTimeAsync(1_000);
    await Promise.resolve();
    await Promise.resolve();

    const prettyCall = jest
      .mocked(writeFile)
      .mock.calls.find(
        ([path]) => typeof path === 'string' && path.endsWith('.pretty.log'),
      );
    expect(prettyCall).toBeDefined();
    expect(writtenString(prettyCall?.[0])).toContain('nemory-user-review-');
    expect(writtenString(prettyCall?.[0])).toContain('-001.pretty.log');
    const pretty = writtenString(prettyCall?.[1]);
    expect(pretty).toContain('1. ЩО МОДЕЛЬ ВИТЯГЛА З ТЕКСТУ');
    expect(pretty).toContain('2. КОНТЕКСТ, ВІДПРАВЛЕНИЙ НА АНАЛІЗ');
    expect(pretty).toContain('3. ВІДПОВІДЬ МОДЕЛІ');
    expect(pretty).toContain('4. ФІНАЛЬНА КАПСУЛА ЗАПИСУ');
    expect(pretty).toContain('domain.work');
    expect(pretty).toContain('Короткий підсумок');
    expect(pretty).toContain('токенів o200k');
    expect(pretty).toContain('tokensFromProvider');
    expect(pretty).toContain('creditsByFormula');
    expect(pretty).toContain('chargedCredits');
    expect(pretty).not.toContain('ratesPer1MTokens');
    expect(pretty).toContain('EXTRACT_USER_MEMORY_DETAILS_V2');
    expect(pretty).toContain('{\\"userMemory\\":[]}');
    expect(pretty).toContain('НЕ ОКРЕМИЙ AI-ВИКЛИК');
    expect(pretty).toContain("кількість об'єктів: 1");
    expect(pretty).toContain("кількість об'єктів: 0");

    const jsonlCall = jest
      .mocked(writeFile)
      .mock.calls.find(
        ([path]) => typeof path === 'string' && path.endsWith('.jsonl'),
      );
    expect(jsonlCall).toBeDefined();
    const jsonReport: unknown = JSON.parse(writtenString(jsonlCall?.[1]));
    expect(jsonReport).toEqual(
      expect.objectContaining({
        blocks: expect.arrayContaining([
          expect.objectContaining({
            step: 1,
            sections: expect.arrayContaining([
              expect.objectContaining({ count: 1 }),
              expect.objectContaining({ count: 0 }),
            ]),
            providerUsage: {
              tokensFromProvider: {
                inputTotal: 100,
                standardInput: 100,
                cacheReadInput: 0,
                cacheWriteInput: 0,
                output: 20,
                total: 120,
              },
              creditsByFormula: {
                standardInput: 0.3,
                cacheReadInput: 0,
                cacheWriteInput: 0,
                output: 0.3,
              },
              chargedCredits: { input: 1, output: 1, total: 2 },
            },
          }),
        ]),
      }),
    );
    const rawDiagnostic = (
      jsonReport as {
        blocks: Array<{
          step: number;
          sections: Array<Record<string, unknown>>;
        }>;
      }
    ).blocks
      .find((block) => block.step === 1)
      ?.sections.find((section) =>
        String(section.label).includes('EXTRACT_USER_MEMORY_DETAILS_V2'),
      );
    expect(rawDiagnostic).toEqual(
      expect.objectContaining({
        diagnostic: true,
        value: expect.objectContaining({
          providerText: '{"userMemory":[]}',
        }),
      }),
    );
    expect(rawDiagnostic).not.toHaveProperty('usage');
    const persistedContext = (
      jsonReport as {
        blocks: Array<{
          step: number;
          sections: Array<{ label: string; value: unknown }>;
        }>;
      }
    ).blocks
      .find((block) => block.step === 2)
      ?.sections.find((section) =>
        section.label.includes("ДОВГОТРИВАЛА ПАМ'ЯТЬ КОРИСТУВАЧА"),
      );
    expect(persistedContext?.value).toEqual([
      expect.objectContaining({
        aggregated: true,
        occurrenceCount: 1,
        evidenceCount: 2,
        content: 'Consolidated episode',
      }),
    ]);
  });

  it('writes a check-in dialog review to the next indexed file', async () => {
    jest.useFakeTimers();
    const day = new Date().toISOString().slice(0, 10);
    jest
      .mocked(readdir)
      .mockResolvedValue([
        `nemory-user-review-${day}-001.pretty.log`,
        `nemory-user-review-${day}-001.jsonl`,
      ] as never);
    const traceId = 'dialog-review-cycle-1';

    rememberMemoryReviewStep({
      step: 1,
      title: 'dialog extraction',
      sourceType: 'checkin_dialog',
      traceId,
      sections: [
        { label: 'ТЕГИ ПИТАННЯ', value: ['domain.work'] },
        {
          label: 'СИРИЙ JSON ПРОВАЙДЕРА · EXTRACT_DIALOG_MEMORY_CAPSULE_V2',
          value: { providerText: '{"schemaVersion":2}' },
          excludeFromUsage: true,
        },
      ],
    });
    rememberMemoryReviewStep({
      step: 2,
      title: 'dialog context',
      sourceType: 'checkin_dialog',
      traceId,
      sections: [
        { label: 'ПОТОЧНЕ ПИТАННЯ КОРИСТУВАЧА', value: 'Питання' },
        { label: 'ПОТОЧНИЙ ЧЕКІН', value: 'Чекін' },
        {
          label: 'РАЗОМ КОНТЕКСТ ДІАЛОГУ + MEMORY V2',
          value: null,
          usage: { tokens: 13_864, credits: 415.92 },
        },
        {
          label: 'УСЬОГО ПРОМПТУ ДО МОДЕЛІ (ОЦІНКА ДО ВІДПРАВКИ)',
          value: {
            messages: 8,
            includesSystemPrompt: true,
            includesGoalsAndSettings: true,
          },
          usage: { tokens: 14_656, credits: 439.68 },
        },
      ],
    });
    rememberMemoryReviewStep({
      step: 3,
      title: 'dialog response',
      sourceType: 'checkin_dialog',
      traceId,
      sections: [{ label: 'ПОВНА ВІДПОВІДЬ', value: 'Відповідь' }],
    });
    rememberMemoryReviewStep({
      step: 4,
      title: 'dialog memory',
      sourceType: 'checkin_dialog',
      traceId,
      sections: [
        {
          label: "ДОВГОТРИВАЛА ПАМ'ЯТЬ NEMORY З ВІДПОВІДІ",
          value: [{ content: 'Корисний висновок' }],
        },
      ],
    });

    await jest.advanceTimersByTimeAsync(1_000);
    await Promise.resolve();
    await Promise.resolve();

    const prettyCall = jest
      .mocked(writeFile)
      .mock.calls.find(
        ([path]) => typeof path === 'string' && path.endsWith('.pretty.log'),
      );
    expect(writtenString(prettyCall?.[0])).toContain('-002.pretty.log');
    const pretty = writtenString(prettyCall?.[1]);
    expect(pretty).toContain('ДІАЛОГ ЧЕКІНУ');
    expect(pretty).toContain('ЩО МОДЕЛЬ ВИТЯГЛА З ХОДУ ДІАЛОГУ');
    expect(pretty).toContain('EXTRACT_DIALOG_MEMORY_CAPSULE_V2');
    expect(pretty).toContain('2. КОНТЕКСТ, ВІДПРАВЛЕНИЙ НА АНАЛІЗ');
    expect(pretty).toContain('ПОТОЧНЕ ПИТАННЯ КОРИСТУВАЧА');
    expect(pretty).toContain('Питання');
    expect(pretty).toContain('ПОТОЧНИЙ ЧЕКІН');
    expect(pretty).toContain('Чекін');
    expect(pretty).toContain(
      'РАЗОМ КОНТЕКСТ ДІАЛОГУ + MEMORY V2 · 415.92 кредитів · 13864 токенів o200k',
    );
    expect(pretty).toContain(
      'УСЬОГО ПРОМПТУ ДО МОДЕЛІ (ОЦІНКА ДО ВІДПРАВКИ) · 439.68 кредитів · 14656 токенів o200k',
    );
    expect(pretty).toContain('ПІДСУМОК УСЬОГО AI-ЦИКЛУ');
  });

  it('writes background consolidation usage to its own indexed report', async () => {
    jest.useFakeTimers();
    const traceId = 'memory-consolidation-review-1';
    rememberMemoryReviewProviderUsage({
      traceId,
      operation: 'consolidate_similar_user_memory_v2',
      model: 'gpt-5.6-luna',
      usageSource: 'provider_usage',
      estimated: false,
      finishReason: 'stop',
      tokensFromProvider: {
        inputTotal: 2883,
        standardInput: 2883,
        cacheReadInput: 0,
        cacheWriteInput: 0,
        output: 1739,
        total: 4622,
      },
      ratesPer1MTokens: {
        standardInput: 3000,
        cacheReadInput: 300,
        cacheWriteInput: 3750,
        output: 15000,
      },
      creditsByFormula: {
        standardInput: 8.649,
        cacheReadInput: 0,
        cacheWriteInput: 0,
        output: 26.085,
      },
      chargedCredits: { input: 9, output: 27, total: 36 },
    });
    rememberMemoryReviewStep({
      step: 4,
      title: 'BACKGROUND USER MEMORY CONSOLIDATION',
      sourceType: 'consolidation',
      traceId,
      sections: [
        {
          label: 'TRIGGER AND PARENT CYCLE',
          value: {
            triggerSourceId: 'entry-1',
            parentTimingTraceId: 'entry-cycle-1',
          },
          excludeFromUsage: true,
        },
      ],
    });

    await jest.advanceTimersByTimeAsync(1_000);
    await Promise.resolve();
    await Promise.resolve();

    const jsonlCall = jest
      .mocked(writeFile)
      .mock.calls.find(
        ([path]) => typeof path === 'string' && path.endsWith('.jsonl'),
      );
    const report = JSON.parse(writtenString(jsonlCall?.[1]));
    expect(report.source).toBe('BACKGROUND USER MEMORY CONSOLIDATION');
    expect(report.blocks).toHaveLength(1);
    expect(report.cycleProviderUsage.chargedCredits).toEqual({
      input: 9,
      output: 27,
      total: 36,
    });
    expect(report.blocks[0].sections[0].value).toEqual(
      expect.objectContaining({ parentTimingTraceId: 'entry-cycle-1' }),
    );
  });
});
