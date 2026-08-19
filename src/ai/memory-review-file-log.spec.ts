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

function providerUsage(
  traceId: string,
  operation: string,
  input: number,
  output: number,
  credits: number,
) {
  return {
    traceId,
    operation,
    model: operation.includes('embedding')
      ? 'text-embedding-3-small'
      : 'gpt-5.6-terra',
    usageSource: 'provider_usage',
    estimated: false,
    finishReason: 'stop',
    tokensFromProvider: {
      inputTotal: input,
      standardInput: input,
      cacheReadInput: 0,
      cacheWriteInput: 0,
      output,
      total: input + output,
    },
    ratesPer1MTokens: {
      standardInput: 30_000,
      cacheReadInput: 3_000,
      cacheWriteInput: 37_500,
      output: 150_000,
    },
    creditsByFormula: {
      standardInput: credits,
      cacheReadInput: 0,
      cacheWriteInput: 0,
      output: 0,
    },
    chargedCredits: { input: credits, output: 0, total: credits },
    promptAccounting: {
      source: 'backend' as const,
      tokenizer: 'o200k_base' as const,
      parts: [{ label: 'SYSTEM PROMPT', characters: input, tokens: input }],
      adjustments: {
        sectionBoundaryTokens: 0,
        messageEnvelopeTokens: 0,
        providerReconciliationTokens: 0,
      },
      totals: {
        partsTokens: input,
        serverContentTokens: input,
        serverEstimatedInputTokens: input,
        serverReconciledInputTokens: input,
        providerInputTokens: input,
        historyInputTokens: input,
      },
      checks: {
        partsAndAdjustmentsEqualProviderInput: true,
        providerInputEqualsHistoryInput: true,
        historyPersisted: true,
      },
    },
  };
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
    expect(writtenString(prettyCall?.[0])).toContain(
      `nemory-user-review-${new Date().toISOString().slice(0, 10)}-entry-001.pretty.log`,
    );
    const pretty = writtenString(prettyCall?.[1]);
    expect(pretty).toContain('1. ЩО МОДЕЛЬ ВИТЯГЛА З ТЕКСТУ');
    expect(pretty).toContain('2. КОНТЕКСТ, ВІДПРАВЛЕНИЙ НА АНАЛІЗ');
    expect(pretty).toContain('3. ВІДПОВІДЬ МОДЕЛІ');
    expect(pretty).toContain('4. ФІНАЛЬНА КАПСУЛА ЗАПИСУ');
    expect(pretty).toContain('domain.work');
    expect(pretty).toContain('Короткий підсумок');
    expect(pretty).toContain('ПРОВАЙДЕР: INPUT 100 + OUTPUT 20');
    expect(pretty).toContain('tokensFromProvider');
    expect(pretty).toContain('creditsByFormula');
    expect(pretty).toContain('chargedCredits');
    expect(pretty).not.toContain('ratesPer1MTokens');
    expect(pretty).not.toContain('EXTRACT_USER_MEMORY_DETAILS_V2');
    expect(pretty).not.toContain('{\\"userMemory\\":[]}');
    expect(pretty).not.toContain('ДІАГНОСТИКА НОРМАЛІЗАЦІЇ');
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
            providerUsage: expect.objectContaining({
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
            }),
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
    expect(rawDiagnostic).toBeUndefined();
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
        `nemory-user-review-${day}-entry-003.pretty.log`,
        `nemory-user-review-${day}-entry-003.jsonl`,
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
          label: 'КАПСУЛА ВІДПОВІДІ ДЛЯ СТАРИХ ХОДІВ АКТИВНОГО ДІАЛОГУ',
          value: 'Стислий зміст відповіді',
        },
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
    expect(writtenString(prettyCall?.[0])).toContain(
      `${day}-dialog-004.pretty.log`,
    );
    const pretty = writtenString(prettyCall?.[1]);
    expect(pretty).toContain('ДІАЛОГ ЧЕКІНУ');
    expect(pretty).toContain('ЩО МОДЕЛЬ ВИТЯГЛА З ХОДУ ДІАЛОГУ');
    expect(pretty).not.toContain('EXTRACT_DIALOG_MEMORY_CAPSULE_V2');
    expect(pretty).toContain('2. КОНТЕКСТ, ВІДПРАВЛЕНИЙ НА АНАЛІЗ');
    expect(pretty).toContain('ПОТОЧНЕ ПИТАННЯ КОРИСТУВАЧА');
    expect(pretty).toContain('Питання');
    expect(pretty).toContain('ПОТОЧНИЙ ЧЕКІН');
    expect(pretty).toContain('Чекін');
    expect(pretty).not.toContain('РАЗОМ КОНТЕКСТ ДІАЛОГУ + MEMORY V2');
    expect(pretty).not.toContain('ОЦІНКА ДО ВІДПРАВКИ');
    expect(pretty).toContain('ПІДСУМОК УСЬОГО AI-ЦИКЛУ');
    expect(pretty).toContain(
      'КАПСУЛА ВІДПОВІДІ ДЛЯ СТАРИХ ХОДІВ АКТИВНОГО ДІАЛОГУ',
    );
    expect(pretty).toContain('Стислий зміст відповіді');
  });

  it('writes a response-only check-in review through the fallback flush', async () => {
    jest.useFakeTimers();
    jest.mocked(readdir).mockResolvedValue([] as never);
    const day = new Date().toISOString().slice(0, 10);
    const traceId = 'checkin-response-only-review';

    rememberMemoryReviewStep({
      step: 2,
      title: 'checkin context',
      sourceType: 'checkin',
      traceId,
      sections: [{ label: 'ПОТОЧНИЙ ЧЕКІН', value: 'Чекін' }],
    });
    rememberMemoryReviewStep({
      step: 3,
      title: 'checkin response',
      sourceType: 'checkin',
      traceId,
      sections: [{ label: 'ПОВНА ВІДПОВІДЬ', value: 'Відповідь' }],
    });

    await jest.advanceTimersByTimeAsync(30_000);
    await Promise.resolve();
    await Promise.resolve();

    const prettyCall = jest
      .mocked(writeFile)
      .mock.calls.find(
        ([path]) => typeof path === 'string' && path.endsWith('.pretty.log'),
      );
    expect(writtenString(prettyCall?.[0])).toContain(
      `${day}-checkin-001.pretty.log`,
    );
    expect(writtenString(prettyCall?.[1])).toContain('ЧЕКІН');
    expect(writtenString(prettyCall?.[1])).toContain('ПОВНА ВІДПОВІДЬ');
  });

  it('ignores the tag response branch and keeps the embedding review cycle', async () => {
    jest.useFakeTimers();
    const traceId = 'dual-review-cycle';

    rememberMemoryReviewProviderUsage(
      providerUsage(traceId, 'build_retrieval_index_v2', 100, 10, 2),
    );
    rememberMemoryReviewProviderUsage(
      providerUsage(traceId, 'generate_embeddings', 25, 0, 1),
    );
    rememberMemoryReviewProviderUsage(
      providerUsage(
        `${traceId}:embeddings`,
        'generate_entry_response',
        200,
        20,
        4,
      ),
    );
    rememberMemoryReviewProviderUsage(
      providerUsage(`${traceId}:tags`, 'generate_entry_response', 300, 30, 6),
    );
    rememberMemoryReviewProviderUsage(
      providerUsage(traceId, 'extract_assistant_memory_capsule_v2', 50, 5, 3),
    );

    rememberMemoryReviewStep({
      step: 1,
      title: 'extracted',
      sourceType: 'entry',
      traceId,
      sections: [
        { label: 'ТЕГИ', value: ['domain.work'] },
        { label: 'НОВІ ТЕГИ', value: [] },
        {
          label: 'ОПТИМІЗОВАНИЙ ТЕКСТ ДЛЯ КАПСУЛИ',
          value: 'Щільний опис поточного запису.',
        },
        {
          label: 'FULL-TEXT EMBEDDING · BACKEND',
          value: { tokens: 25, cached: false },
          excludeFromUsage: true,
        },
        {
          label: 'ПРОМПТ ІНДЕКСАЦІЇ V2 · ТЕГИ + ОПТИМІЗОВАНИЙ ОПИС',
          value: 'Index system rules\n\nCURRENT USER TEXT:\nA readable entry',
          excludeFromUsage: true,
        },
      ],
    });
    const sharedCurrentText =
      'Спільний поточний текст, який не потрібно вдруге друкувати для паралельної гілки аналізу.';
    const sharedRelevantContent = `[RELEVANT_PREVIOUS_ENTRIES]
[RELEVANT_ENTRY_DIGEST]
Date: 2026-08-01 12:00 Europe/Kyiv
Source: Diary entry
Summary of the user's previous writing: Та сама релевантна капсула для обох паралельних гілок аналізу.
[FOLLOW_UP_DIALOG_MEMORY_OLDEST_TO_NEWEST]
[FOLLOW_UP_DIALOG_MEMORY date=2026-08-01 13:00 Europe/Kyiv]
[SHORT_USER_MESSAGE]
Чи варто тепер змінити домовлений план?
[/SHORT_USER_MESSAGE]
[NEMORY_MEMORY_FROM_RESPONSE_TO_THIS_MESSAGE]
- Перевіряє новий факт перед зміною плану
[/NEMORY_MEMORY_FROM_RESPONSE_TO_THIS_MESSAGE]
[/FOLLOW_UP_DIALOG_MEMORY]
[/FOLLOW_UP_DIALOG_MEMORY_OLDEST_TO_NEWEST]
[/RELEVANT_ENTRY_DIGEST]
[/RELEVANT_PREVIOUS_ENTRIES]`;
    for (const branch of ['embeddings', 'tags'] as const) {
      rememberMemoryReviewStep({
        step: 2,
        title: 'context',
        sourceType: 'entry',
        traceId: `${traceId}:${branch}`,
        sections: [
          {
            label: 'ПОТОЧНИЙ ЗАПИС',
            value: { text: sharedCurrentText },
          },
          {
            label: 'РЕЛЕВАНТНІ КАПСУЛИ',
            value: sharedRelevantContent,
          },
          {
            label: 'ПОРЯДОК ПОВІДОМЛЕНЬ У ПРОМПТІ',
            value: [
              { index: 1, role: 'system', source: 'SYSTEM PROMPT' },
              { index: 2, role: 'user', source: 'ПОТОЧНИЙ ЗАПИС' },
            ],
            count: 2,
          },
          {
            label: 'SYSTEM PROMPT · IDENTITY AND RELATIONSHIP:',
            value: `System ${branch}`,
          },
          {
            label: 'УСЬОГО ПРОМПТУ ДО МОДЕЛІ (SYSTEM PROMPT ВРАХОВАНО)',
            value: {
              messages: 2,
              systemPromptIncludedInModelRequest: true,
              systemPromptContentLogged: false,
            },
            usage: { tokens: 250, credits: 7.5 },
          },
        ],
      });
      rememberMemoryReviewStep({
        step: 3,
        title: 'response',
        sourceType: 'entry',
        traceId: `${traceId}:${branch}`,
        sections: [
          { label: 'КОРОТКА ВІДПОВІДЬ', value: `Коротко ${branch}` },
          { label: 'ПОВНА ВІДПОВІДЬ', value: `Повна відповідь ${branch}` },
          { label: 'КОРОТКА РЕФЛЕКСІЯ', value: `Коротко ${branch}` },
          { label: 'ПОВНА РЕФЛЕКСІЯ', value: `Повна відповідь ${branch}` },
        ],
      });
    }
    rememberMemoryReviewStep({
      step: 4,
      title: 'capsule',
      sourceType: 'entry',
      traceId,
      sections: [],
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
    const prettyCall = jest
      .mocked(writeFile)
      .mock.calls.find(
        ([path]) => typeof path === 'string' && path.endsWith('.pretty.log'),
      );
    const pretty = writtenString(prettyCall?.[1]);
    const extraction = report.blocks.find(
      (block: { step: number }) => block.step === 1,
    );
    const context = report.blocks.find(
      (block: { step: number }) => block.step === 2,
    );
    const response = report.blocks.find(
      (block: { step: number }) => block.step === 3,
    );
    const finalCapsule = report.blocks.find(
      (block: { step: number }) => block.step === 4,
    );

    expect(report.providerCalls).toHaveLength(4);
    expect(pretty).not.toContain('FULL-TEXT EMBEDDING');
    expect(pretty).not.toContain('Index system rules');
    expect(pretty).not.toContain('[ПОВІДОМЛЕННЯ');
    expect(pretty).toContain('EMBEDDINGS · ПОРЯДОК ПОВІДОМЛЕНЬ У ПРОМПТІ');
    expect(pretty).toContain(
      'EMBEDDINGS · SYSTEM PROMPT · IDENTITY AND RELATIONSHIP:',
    );
    expect(pretty).toContain('System embeddings');
    expect(pretty).not.toContain('User tags');
    expect(pretty).not.toContain('systemPromptContentLogged');
    expect(pretty).toContain('СЕРВЕРНИЙ РОЗКЛАД ФАКТИЧНОГО INPUT-ПРОМПТУ');
    expect(pretty).toContain('serverReconciledInputTokens');
    expect(pretty).toContain('providerInputEqualsHistoryInput');
    expect(pretty).not.toContain('ВИКЛИКИ ПРОВАЙДЕРА ОКРЕМО');
    expect(pretty).toContain('ПІДСУМОК УСЬОГО AI-ЦИКЛУ');
    expect(report.cycleProviderUsage.tokensFromProvider.total).toBe(410);
    expect(report.cycleProviderUsage.chargedCredits.total).toBe(10);
    expect(extraction.providerUsage.tokensFromProvider.total).toBe(135);
    expect(
      extraction.sections.find((section: { label: string }) =>
        section.label.includes('ОПТИМІЗОВАНИЙ ОПИС ЗАПИСУ'),
      ).value,
    ).toEqual(
      expect.objectContaining({
        characters: 'Щільний опис поточного запису.'.length,
      }),
    );
    expect(context.providerUsage.tokensFromProvider.total).toBe(220);
    expect(context.providerUsage.breakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          branch: 'embeddings',
          operation: 'generate_entry_response',
          tokensFromProvider: expect.objectContaining({ total: 220 }),
        }),
      ]),
    );
    expect(context.providerUsage.breakdown).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ branch: 'tags' })]),
    );
    expect(context.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'EMBEDDINGS · ПОТОЧНИЙ ЗАПИС' }),
        expect.objectContaining({
          label:
            'EMBEDDINGS · ВІДПОВІДЬ НА ЗАПИС · СЕРВЕРНИЙ РОЗКЛАД ФАКТИЧНОГО INPUT-ПРОМПТУ',
          value: expect.objectContaining({
            totals: expect.objectContaining({
              serverReconciledInputTokens: 200,
              providerInputTokens: 200,
              historyInputTokens: 200,
            }),
          }),
        }),
      ]),
    );
    expect(context.sections).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: expect.stringContaining('TAGS ·') }),
      ]),
    );
    expect(
      context.sections.find(
        (section: { label: string }) =>
          section.label === 'EMBEDDINGS · РЕЛЕВАНТНІ КАПСУЛИ',
      ).value[0].followUpDialogMemoryOldestToNewest[0],
    ).toEqual(
      expect.objectContaining({
        shortUserMessage: 'Чи варто тепер змінити домовлений план?',
        nemoryMemoryFromResponse: ['Перевіряє новий факт перед зміною плану'],
      }),
    );
    expect(
      context.sections.some((section: { label: string }) =>
        section.label.includes('ПОВНИЙ ПРОМПТ ДО МОДЕЛІ'),
      ),
    ).toBe(false);
    expect(response.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'EMBEDDINGS · ПОВНА ВІДПОВІДЬ' }),
      ]),
    );
    expect(response.sections).toHaveLength(2);
    expect(
      response.sections.some((section: { label: string }) =>
        section.label.includes('РЕФЛЕКСІЯ'),
      ),
    ).toBe(false);
    expect(
      response.sections.every(
        (section: unknown) => !('usage' in Object(section)),
      ),
    ).toBe(true);
    expect(
      finalCapsule.sections.some((section: { label: string }) =>
        ['ТЕГИ', 'НОВІ ТЕГИ', 'ОПТИМІЗОВАНИЙ ОПИС'].some((label) =>
          section.label.includes(label),
        ),
      ),
    ).toBe(false);
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
