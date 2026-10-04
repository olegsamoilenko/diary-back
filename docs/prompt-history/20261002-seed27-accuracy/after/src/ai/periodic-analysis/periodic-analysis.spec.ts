import { describe, expect, it, jest } from '@jest/globals';
import {
  PeriodicAnalysisService,
  type LocalAnalysisReport,
} from './periodic-analysis.service';
import {
  PeriodicAnalysisDto,
  PeriodicAnalysisDialogDto,
} from './periodic-analysis.dto';
import {
  analysisLocalTime,
  validateAnalysisPeriod,
  parseAnalysisResult,
  localizeAnalysisInstants,
} from './periodic-analysis.context';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AiModel } from 'src/users/types';
import { BasePlanIds } from 'src/plans/types';
import { writeContextAudit } from 'src/logs/context-audit';
import { NEMORY_PSYCHOLOGIST_ROLE } from '../utils/journal-response-instructions';
import { buildNemoryCapabilitiesPrompt } from '../utils/nemory-capabilities';
import { buildAnthropicPromptCachePayload } from '../utils/anthropic-prompt-cache';
import { addExplicitPromptCacheBreakpoint } from '../utils/openai-prompt-cache';

jest.mock('src/logs/context-audit', () => ({ writeContextAudit: jest.fn() }));

const dto: PeriodicAnalysisDto = {
  expectedUserId: 1,
  requestId: '11111111-1111-4111-8111-111111111111',
  kind: 'day',
  start: '2026-09-17',
  end: '2026-09-17',
  timezone: 'Europe/Kiev',
  asOf: '2026-09-17T19:00:00Z',
  firstDayOfWeek: 1,
  snapshot: {
    days: [{ day: '2026-09-17', entries: [{ text: 'Synthetic fixture' }] }],
  },
};
it.each(['day', 'week', 'month', 'year'] as const)(
  'accounts %s summary dialogs separately',
  (kind) => {
    const service = Object.create(PeriodicAnalysisService.prototype) as any;
    const request = service.responseRequest({
      userId: 1,
      model: AiModel.GPT_5_6_LUNA,
      messages: [{ role: 'system', content: 'Prompt' }],
      reportId: 'report',
      requestId: 'request',
      outputLimit: 1000,
      mode: 'dialog',
      kind,
    });
    const labels = {
      day: 'daily_analysis_dialog',
      week: 'weekly_analysis_dialog',
      month: 'monthly_analysis_dialog',
      year: 'yearly_analysis_dialog',
    };
    expect(request.accounting.tokenType).toBe(labels[kind]);
  },
);
function fixture() {
  jest.mocked(writeContextAudit).mockClear();
  const claimed = new Set<string>();
  const cycles: any = {
    claimExecution: jest.fn(async (owner: number, id: string) => {
      const key = `${owner}:${id}`;
      if (claimed.has(key)) return false;
      claimed.add(key);
      return true;
    }),
  };
  const ai: any = {
    completeAiPromptUsageCycle: jest.fn(),
    countOpenAiTokens: jest.fn(() => 1000),
    countStringTokens: jest.fn(() => 870),
    getStylesBlock: jest.fn(async () => 'User style'),
    buildLanguageBlock: jest.fn(() => 'Language: uk'),
    executeResponse: jest
      .fn<(...args: any[]) => Promise<any>>()
      .mockResolvedValue({
        fullText:
          '{"text":"A supported observation.","capsule":"Synthetic capsule."}',
        credits: 20,
        inputTokens: 1000,
        cachedInputTokens: 100,
        outputTokens: 200,
        finishReason: 'stop',
      }),
  };
  const users: any = {
    findById: jest.fn(async () => ({
      settings: { aiModel: AiModel.GPT_5_6_TERRA, conversationLanguage: 'uk' },
    })),
  };
  const subscriptionUsage: any = {
    getEffectiveAiBasePlanId: jest.fn(async () => BasePlanIds.LITE_M1),
  };
  return {
    service: new PeriodicAnalysisService(ai, users, cycles, subscriptionUsage),
    ai,
    cycles,
    users,
    subscriptionUsage,
  };
}

it('supplies active commitments to a periodic summary and replaces the active list for its dialog', async () => {
  const f = fixture();
  const activeCommitments = [
    {
      key: 'follow_up.work',
      text: 'Follow up while the project runs',
      duration: 'ongoing' as const,
      status: 'open' as const,
      triggerTags: [],
    },
  ];
  const report = await f.service.generate(1, { ...dto, activeCommitments });
  expect(JSON.parse(report.prompt[1].content).activeCommitments).toEqual(
    activeCommitments,
  );
  await f.service.dialog(
    1,
    report.id,
    'fresh-actions-dialog',
    'Continue',
    undefined,
    undefined,
    report,
    [],
  );
  const messages = f.ai.executeResponse.mock.calls.at(-1)[0].messages;
  expect(messages).toContainEqual({
    role: 'user',
    content:
      'CURRENT ACTIVE NEMORY COMMITMENTS (supersede older commitment lists):\n[]',
  });
});
const prior = {
  kind: 'day' as const,
  start: '2026-09-16',
  end: '2026-09-16',
  timezone: dto.timezone,
  createdAt: '2026-09-16T19:00:00Z',
  capsule: 'Only locally supplied evidence.',
};

const weekDto: PeriodicAnalysisDto = {
  ...dto,
  kind: 'week',
  start: '2026-09-07',
  end: '2026-09-13',
  snapshot: {
    dailyCapsules: Array.from({ length: 7 }, (_, index) => {
      const day = `2026-09-${String(7 + index).padStart(2, '0')}`;
      return {
        kind: 'day',
        start: day,
        end: day,
        timezone: dto.timezone,
        createdAt: `${day}T19:00:00Z`,
        asOf: `${day}T19:00:00Z`,
        capsule: `Facts for ${day}`,
      };
    }),
    ignoredRawEntries: 'MUST NOT REACH THE MODEL',
  },
};

describe('daily history priority', () => {
  const days = weekDto.snapshot.dailyCapsules as (typeof prior)[];
  const week = {
    ...prior,
    kind: 'week' as const,
    start: '2026-09-07',
    end: '2026-09-13',
    createdAt: '2026-09-13T20:00:00Z',
  };
  const olderWeek = {
    ...week,
    start: '2026-08-31',
    end: '2026-09-06',
    createdAt: '2026-09-06T20:00:00Z',
  };

  it.each([
    { label: 'all seven days', days, expected: [...days].reverse() },
    {
      label: 'a partially available week',
      days: [days[0], days[6]],
      expected: [days[6], days[0]],
    },
    { label: 'no daily capsules', days: [], expected: [week] },
  ])(
    'preserves $label and only adds older weekly background',
    async ({ days: availableDays, expected }) => {
      const f = fixture();
      const request: PeriodicAnalysisDto = {
        ...dto,
        start: '2026-09-14',
        end: '2026-09-14',
        asOf: '2026-09-14T19:00:00Z',
        previousAnalyses: [
          week,
          olderWeek,
          ...availableDays,
          { ...week, kind: 'month' },
          { ...olderWeek, kind: 'year' },
          { ...olderWeek, timezone: 'UTC' },
          { ...olderWeek, createdAt: '2026-09-15T20:00:00Z' },
        ],
      };
      const original = JSON.stringify(request);
      await f.service.estimate(1, request);
      const estimated = f.ai.countOpenAiTokens.mock.calls.find(
        ([messages]: any[]) =>
          messages.some((message: any) => message.role === 'system'),
      )[0];
      const report = await f.service.generate(1, request);
      expect(report.prompt).toEqual(estimated);
      expect(JSON.parse(report.prompt[1].content).previousAnalyses).toEqual(
        [...expected, olderWeek].map(({ kind, start, end, capsule }) => ({
          kind,
          start,
          end,
          capsule,
        })),
      );
      expect(JSON.stringify(request)).toBe(original);
    },
  );
});

const yearDto: PeriodicAnalysisDto = {
  ...dto,
  kind: 'year',
  start: '2024-01-01',
  end: '2024-12-31',
  asOf: '2025-01-01T00:00:00Z',
  snapshot: {
    monthlyCapsules: Array.from({ length: 12 }, (_, i) => {
      const start = `2024-${String(i + 1).padStart(2, '0')}-01`;
      const end = new Date(Date.UTC(2024, i + 1, 0)).toISOString().slice(0, 10);
      return {
        kind: 'month',
        start,
        end,
        timezone: dto.timezone,
        createdAt: end + 'T20:00:00Z',
        asOf: end + 'T20:00:00Z',
        capsule: `Facts ${start}`,
      };
    }),
    rawEntries: 'MUST NOT REACH THE MODEL',
  },
};
describe('yearly analysis', () => {
  it('validates a leap year and rejects partial/cross-year ranges', async () => {
    expect(
      await validate(plainToInstance(PeriodicAnalysisDto, yearDto)),
    ).toHaveLength(0);
    expect(() => validateAnalysisPeriod(yearDto)).not.toThrow();
    for (const bounds of [
      { start: '2024-02-01' },
      { end: '2024-12-30' },
      { start: '2023-12-31' },
    ])
      expect(() => validateAnalysisPeriod({ ...yearDto, ...bounds })).toThrow();
  });
  it('uses all months for estimate and generation, bills yearly once, and supports local dialogs', async () => {
    const f = fixture();
    const previous = {
      ...prior,
      kind: 'year' as const,
      start: '2023-01-01',
      end: '2023-12-31',
      createdAt: '2024-01-01T00:00:00Z',
    };
    const request = {
      ...yearDto,
      previousAnalyses: [previous, { ...previous, kind: 'month' as const }],
    };
    await f.service.estimate(1, request);
    const estimated = f.ai.countOpenAiTokens.mock.calls.find(
      ([messages]: any[]) => messages.length === 2,
    )?.[0];
    const report = await f.service.generate(1, request);
    expect(report.prompt).toEqual(estimated);
    expect(f.ai.executeResponse).toHaveBeenCalledTimes(2);
    expect(f.ai.executeResponse.mock.calls[0][0].accounting).toMatchObject({
      tokenType: 'yearly_analysis',
      cycleComplete: false,
    });
    const context = JSON.parse(report.prompt[1].content);
    expect(context.snapshot.monthlyCapsules).toHaveLength(12);
    expect(context.snapshot.missingMonths).toEqual([]);
    expect(context.snapshot).not.toHaveProperty('rawEntries');
    expect(context.previousAnalyses).toHaveLength(1);
    expect(report.capsule).toBe('Synthetic capsule.');
    f.ai.executeResponse.mockResolvedValueOnce({
      fullText: 'Follow-up',
      credits: 3,
      finishReason: 'stop',
    });
    const next = await f.service.dialog(
      1,
      report.id,
      'year-turn',
      'Why?',
      undefined,
      undefined,
      report,
    );
    expect(next.dialogs[0].answer).toBe('Follow-up');
    expect(f.ai.executeResponse.mock.calls[2][0].accounting.tokenType).toBe(
      'yearly_analysis_dialog',
    );
  });
  it('names missing months and rejects invalid evidence before a paid claim', async () => {
    const rows = yearDto.snapshot.monthlyCapsules as any[];
    const f = fixture();
    const report = await f.service.generate(1, {
      ...yearDto,
      snapshot: { monthlyCapsules: [rows[1]] },
    });
    const context = JSON.parse(report.prompt[1].content);
    expect(context.snapshot.missingMonths).toHaveLength(11);
    expect(context.snapshot.missingMonths).not.toContain('2024-02');
    for (const monthlyCapsules of [
      [],
      [rows[0], rows[0]],
      [{ ...rows[1], end: '2024-02-28' }],
      [{ ...rows[0], timezone: 'UTC' }],
      [{ ...rows[0], createdAt: '2099-01-01T00:00:00Z' }],
      [{ ...rows[0], start: '2023-01-01', end: '2023-01-31' }],
    ]) {
      const invalid = fixture();
      await expect(
        invalid.service.generate(1, {
          ...yearDto,
          snapshot: { monthlyCapsules },
        }),
      ).rejects.toThrow();
      expect(invalid.ai.executeResponse).not.toHaveBeenCalled();
      expect(invalid.cycles.claimExecution).not.toHaveBeenCalled();
    }
  });
});

describe('separate month/year capsules', () => {
  const cases = [
    {
      request: {
        ...dto,
        kind: 'month' as const,
        start: '2026-09-01',
        end: '2026-09-30',
      },
      label: 'monthly',
      maximum: 1500,
    },
    { request: yearDto, label: 'yearly', maximum: 1800 },
  ];
  it.each(cases)(
    'accepts text-only $label output and uses Luna with actual source data',
    async ({ request, label, maximum }) => {
      const f = fixture();
      f.ai.executeResponse.mockResolvedValueOnce({
        fullText: '{"text":"Complete supported analysis."}',
        credits: 20,
        inputTokens: 1000,
        cachedInputTokens: 100,
        outputTokens: 200,
        finishReason: 'stop',
      });
      const report = await f.service.generate(1, request);
      expect(f.ai.executeResponse).toHaveBeenCalledTimes(2);
      const capsuleCall = f.ai.executeResponse.mock.calls[1][0];
      expect(capsuleCall.model).toBe(AiModel.GPT_5_6_LUNA);
      expect(capsuleCall.accounting.tokenType).toBe(`${label}_capsule`);
      expect(capsuleCall.accounting.operation).toBe(
        `generate_${label}_analysis_capsule`,
      );
      expect(capsuleCall.messages[1]).toEqual(report.prompt[1]);
      expect(capsuleCall.messages.at(-1).content).toContain(
        'Complete supported analysis.',
      );
      expect(capsuleCall.messages[0].content).toContain(
        `maximum ${maximum} characters`,
      );
      expect(report).toMatchObject({
        text: 'Complete supported analysis.',
        capsule: 'Synthetic capsule.',
        credits: 40,
        inputTokens: 2000,
        outputTokens: 400,
      });
      expect(report.capsuleGeneration).toMatchObject({
        status: 'ready',
        tokens: 870,
        maxCharacters: maximum,
      });
      expect(report.capsuleGeneration).not.toHaveProperty('maxTokens');
      expect(f.ai.completeAiPromptUsageCycle).toHaveBeenCalledWith(
        request.requestId,
        `${label}_analysis_with_capsule`,
      );
      const estimated = fixture();
      await estimated.service.estimate(1, request);
      const lunaInputs = estimated.ai.countOpenAiTokens.mock.calls.filter(
        (call: any[]) => call[1] === AiModel.GPT_5_6_LUNA,
      );
      expect(lunaInputs).toHaveLength(2); // Primary capsule plus at most one compression pass.
      expect(lunaInputs[0][0][0].content).toContain('Prepare a factual');
      expect(lunaInputs[1][0][0].content).toContain('Shorten the supplied');
    },
  );
  it.each(cases)(
    'preserves the $label answer when Luna fails',
    async ({ request, label }) => {
      const f = fixture();
      f.ai.executeResponse
        .mockResolvedValueOnce({
          fullText: '{"text":"Keep this answer."}',
          credits: 20,
          inputTokens: 1000,
          cachedInputTokens: 0,
          outputTokens: 200,
          finishReason: 'stop',
        })
        .mockRejectedValueOnce(new Error('Luna unavailable'));
      const report = await f.service.generate(1, request);
      expect(report.text).toBe('Keep this answer.');
      expect(report.capsuleGeneration).toMatchObject({
        status: 'failed',
        attempts: 1,
      });
      expect(f.ai.completeAiPromptUsageCycle).toHaveBeenCalledWith(
        request.requestId,
        `${label}_analysis_with_capsule`,
      );
    },
  );
  it.each(cases)(
    'compresses $label by character size while reporting actual token usage',
    async ({ request, maximum }) => {
      const f = fixture();
      const response = (fullText: string) => ({
        fullText,
        credits: 2,
        inputTokens: 20,
        cachedInputTokens: 0,
        outputTokens: 10,
        finishReason: 'stop',
      });
      f.ai.executeResponse
        .mockResolvedValueOnce(response('{"text":"Analysis"}'))
        .mockResolvedValueOnce(
          response(JSON.stringify({ capsule: 'a'.repeat(maximum + 1) })),
        )
        .mockResolvedValueOnce(
          response('{"capsule":"Shorter complete capsule."}'),
        );
      // Token count below the character limit must not suppress a required compression pass.
      f.ai.countStringTokens.mockReturnValue(200);
      const report = await f.service.generate(1, request);
      expect(f.ai.executeResponse).toHaveBeenCalledTimes(3);
      expect(report.capsule).toBe('Shorter complete capsule.');
      expect(report.capsuleGeneration).toMatchObject({
        status: 'ready',
        attempts: 2,
        tokens: 200,
        maxCharacters: maximum,
        characters: report.capsule.length,
      });
      expect(report.credits).toBe(6);
    },
  );
});

describe('weekly hierarchy and tier budgets', () => {
  describe.each(['day', 'week', 'month', 'year'] as const)(
    '%s ordered history stop',
    (kind) => {
      it.each([199, 200, 500])(
        'keeps full evidence and stops at the first capsule with %i tokens remaining',
        async (remaining) => {
          const f = fixture();
          f.subscriptionUsage.getEffectiveAiBasePlanId.mockResolvedValue(
            BasePlanIds.BASE_M1,
          );
          const limits = { day: 11500, week: 14500, month: 17500, year: 20500 };
          const source =
            kind === 'week'
              ? weekDto
              : kind === 'year'
                ? yearDto
                : kind === 'month'
                  ? { ...dto, kind, start: '2026-09-01', end: '2026-09-30' }
                  : dto;
          const ranges = {
            day: [
              ['2026-09-16', '2026-09-16'],
              ['2026-09-15', '2026-09-15'],
            ],
            week: [
              ['2026-08-31', '2026-09-06'],
              ['2026-08-24', '2026-08-30'],
            ],
            month: [
              ['2026-08-01', '2026-08-31'],
              ['2026-07-01', '2026-07-31'],
            ],
            year: [
              ['2023-01-01', '2023-12-31'],
              ['2022-01-01', '2022-12-31'],
            ],
          };
          const history = ranges[kind].map(([start, end], index) => ({
            ...prior,
            kind,
            start,
            end,
            createdAt: `${end}T22:00:00Z`,
            capsule:
              index === 0 ? 'Whole newest capsule' : 'Tiny older capsule',
          }));
          const counts: number[] = [];
          f.ai.countOpenAiTokens.mockImplementation((messages: any[]) => {
            if (messages.length !== 1) return limits[kind] + 3000;
            const count = JSON.parse(messages[0].content).previousAnalyses
              .length;
            counts.push(count);
            return limits[kind] - remaining + count * 1500;
          });
          const request = { ...source, previousAnalyses: history };
          await f.service.estimate(1, request);
          const estimated = f.ai.countOpenAiTokens.mock.calls.find(
            ([messages]: any[]) => messages.length === 2,
          )?.[0];
          const report = await f.service.generate(1, request);
          expect(report.prompt).toEqual(estimated);
          const context = JSON.parse(report.prompt[1].content);
          expect(
            context.previousAnalyses.map((row: any) => row.capsule),
          ).toEqual(remaining < 200 ? [] : ['Whole newest capsule']);
          expect(counts).not.toContain(2);
          if (kind === 'day' || kind === 'month')
            expect(context.snapshot).toEqual(source.snapshot);
          if (kind === 'week')
            expect(context.snapshot.dailyCapsules).toHaveLength(7);
          if (kind === 'year')
            expect(context.snapshot.monthlyCapsules).toHaveLength(12);
          expect(writeContextAudit).toHaveBeenCalledWith(
            'period.context.selection',
            expect.objectContaining({
              contextOverageTokens: remaining < 200 ? 0 : 1500 - remaining,
              selectionStopRemainingTokens: 200,
            }),
          );
        },
      );
    },
  );
  it.each([
    ['day', BasePlanIds.LITE_M1, 7500],
    ['day', BasePlanIds.BASE_M1, 11500],
    ['day', BasePlanIds.PRO_M1, 17000],
    ['week', BasePlanIds.LITE_M1, 9500],
    ['week', BasePlanIds.BASE_M1, 14500],
    ['week', BasePlanIds.PRO_M1, 21000],
    ['month', BasePlanIds.LITE_M1, 11500],
    ['month', BasePlanIds.BASE_M1, 17500],
    ['month', BasePlanIds.PRO_M1, 26000],
    ['year', BasePlanIds.LITE_M1, 13500],
    ['year', BasePlanIds.BASE_M1, 20500],
    ['year', BasePlanIds.PRO_M1, 31000],
  ] as Array<['day' | 'week' | 'month' | 'year', BasePlanIds, number]>)(
    'enforces %s %s current-period boundary before billing, including commitments and note',
    async (kind, plan, limit) => {
      const f = fixture();
      f.subscriptionUsage.getEffectiveAiBasePlanId.mockResolvedValue(plan);
      const request = {
        ...(kind === 'week'
          ? weekDto
          : kind === 'year'
            ? yearDto
            : kind === 'month'
              ? { ...dto, kind, start: '2026-09-01', end: '2026-09-30' }
              : dto),
        note: 'Preserve clarification',
        activeCommitments: [],
      };
      f.ai.countOpenAiTokens.mockImplementation((messages: any[]) => {
        if (messages.length !== 1) return limit + 3000;
        const context = JSON.parse(messages[0].content);
        expect(context.note).toBe(request.note);
        expect(context.activeCommitments).toEqual([]);
        return limit + 1;
      });
      await expect(f.service.estimate(1, request)).rejects.toThrow(
        'ANALYSIS_CONTEXT_LIMIT',
      );
      await expect(f.service.generate(1, request)).rejects.toThrow(
        'ANALYSIS_CONTEXT_LIMIT',
      );
      expect(f.ai.executeResponse).not.toHaveBeenCalled();
      expect(f.cycles.claimExecution).not.toHaveBeenCalled();
      expect(writeContextAudit).toHaveBeenCalledWith(
        'period.context.selection',
        expect.objectContaining({
          contextTokenLimit: limit,
          currentPeriodTokens: limit + 1,
          status: 'current_period_over_budget',
        }),
      );
      // Exact boundary is accepted, even when system instructions make the full input larger.
      f.ai.countOpenAiTokens.mockImplementation((messages: any[]) =>
        messages.length === 1 ? limit : limit + 3000,
      );
      const estimate = await f.service.estimate(1, request);
      expect(estimate.inputTokens).toBe(limit + 3000);
      const report = await f.service.generate(1, request);
      expect(JSON.parse(report.prompt[1].content).note).toBe(request.note);
      const expectedByKind = {
        day: [800, 1200, 1800],
        week: [1200, 1800, 2600],
        month: [1600, 2400, 3400],
        year: [2200, 3200, 4500],
      };
      const tier =
        plan === BasePlanIds.PRO_M1 ? 2 : plan === BasePlanIds.BASE_M1 ? 1 : 0;
      const visible = expectedByKind[kind][tier];
      expect(report.prompt[0].content).toContain(
        `approximately ${visible} tokens`,
      );
      expect(f.ai.executeResponse.mock.calls[0][0].runtime).toMatchObject({
        outputLimit: visible,
        outputPurpose: 'tier_response',
      });
      expect(estimate.outputLimit).toBe(visible + 4096 + 256);
    },
  );

  it('uses identical daily history in estimate and generation and preserves the complete day', async () => {
    const f = fixture();
    f.subscriptionUsage.getEffectiveAiBasePlanId.mockResolvedValue(
      BasePlanIds.BASE_M1,
    );
    f.ai.countOpenAiTokens.mockImplementation((messages: any[]) =>
      messages.length === 1
        ? 10500 + JSON.parse(messages[0].content).previousAnalyses.length * 1000
        : 14000,
    );
    const request = {
      ...dto,
      previousAnalyses: [
        prior,
        { ...prior, start: '2026-09-15', end: '2026-09-15' },
      ],
    };
    await f.service.estimate(1, request);
    const estimated = f.ai.countOpenAiTokens.mock.calls.find(
      ([messages]: any[]) => messages.length === 2,
    )?.[0];
    const report = await f.service.generate(1, request);
    expect(report.prompt).toEqual(estimated);
    const context = JSON.parse(report.prompt[1].content);
    expect(context.snapshot).toEqual(dto.snapshot);
    expect(context.previousAnalyses).toHaveLength(1);
    expect(context.previousAnalyses[0].start).toBe(prior.start);
  });

  it('recovers only a weekly capsule from dated daily evidence, with no main answer or older history', async () => {
    const f = fixture();
    f.subscriptionUsage.getEffectiveAiBasePlanId.mockResolvedValue(
      BasePlanIds.BASE_M1,
    );
    const result = await f.service.regenerateWeeklyCapsule(1, {
      ...weekDto,
      previousAnalyses: [prior],
    });
    expect(f.ai.executeResponse).toHaveBeenCalledTimes(1);
    const call = f.ai.executeResponse.mock.calls[0][0];
    expect(call.runtime.outputLimit).toBe(5446);
    expect(call.accounting.tokenType).toBe('weekly_capsule');
    const source = JSON.parse(call.messages[1].content);
    expect(source.snapshot.dailyCapsules).toHaveLength(7);
    expect(source.previousAnalyses).toBeUndefined();
    expect(JSON.stringify(call.messages)).not.toContain(
      'A supported observation.',
    );
    expect(result.capsuleGeneration?.status).toBe('ready');
    await expect(f.service.regenerateWeeklyCapsule(1, weekDto)).rejects.toThrow(
      'ALREADY_STARTED',
    );
    expect(f.ai.executeResponse).toHaveBeenCalledTimes(1);
  });
  it('rejects wrong owner/kind or invalid capsule evidence before paid recovery', async () => {
    const f = fixture();
    await expect(f.service.regenerateWeeklyCapsule(2, weekDto)).rejects.toThrow(
      'account changed',
    );
    await expect(f.service.regenerateWeeklyCapsule(1, dto)).rejects.toThrow(
      'WEEK_CAPSULE_REQUIRED',
    );
    await expect(
      f.service.regenerateWeeklyCapsule(1, { ...weekDto, snapshot: {} }),
    ).rejects.toThrow('DAILY_CAPSULES_REQUIRED');
    expect(f.ai.executeResponse).not.toHaveBeenCalled();
    expect(f.cycles.claimExecution).not.toHaveBeenCalled();
  });
  it.each([
    [BasePlanIds.LITE_M1, 9500, 1100],
    [BasePlanIds.BASE_M1, 14500, 1350],
    [BasePlanIds.PRO_M1, 21000, 1700],
  ])(
    'keeps all seven days and fits newest previous weeks within the %s ceiling',
    async (plan, limit, cap) => {
      const f = fixture();
      f.subscriptionUsage.getEffectiveAiBasePlanId.mockResolvedValue(plan);
      f.ai.countOpenAiTokens.mockImplementation((messages: any[]) => {
        if (messages.length !== 1) return 2000;
        const context = JSON.parse(messages[0].content);
        return Number(limit) - 500 + context.previousAnalyses.length * 500;
      });
      const oldWeek = {
        ...prior,
        kind: 'week' as const,
        start: '2026-08-31',
        end: '2026-09-06',
      };
      const request = {
        ...weekDto,
        previousAnalyses: [
          prior,
          oldWeek,
          { ...oldWeek, start: '2026-08-24', end: '2026-08-30' },
        ],
      };
      const estimate = await f.service.estimate(1, request);
      expect(estimate.estimatedMaxCredits).toBeGreaterThan(0);
      expect(f.ai.executeResponse).not.toHaveBeenCalled();
      const report = await f.service.generate(1, request);
      const [main, luna] = f.ai.executeResponse.mock.calls.map(
        (call: any[]) => call[0],
      );
      const context = JSON.parse(main.messages[1].content);
      expect(
        context.snapshot.dailyCapsules.map((row: any) => row.start),
      ).toEqual(
        (weekDto.snapshot.dailyCapsules as any[]).map((row) => row.start),
      );
      expect(context.snapshot.missingDays).toEqual([]);
      expect(JSON.stringify(context)).not.toContain('MUST NOT REACH');
      expect(context.previousAnalyses.map((row: any) => row.start)).toEqual([
        '2026-08-31',
      ]);
      expect(writeContextAudit).toHaveBeenCalledWith(
        'period.context.selection',
        expect.objectContaining({
          contextTokenLimit: limit,
          contextTokens: limit,
          excludedPreviousPeriods: [
            {
              kind: 'week',
              start: '2026-08-24',
              end: '2026-08-30',
              reason: 'context_budget',
            },
          ],
        }),
      );
      expect(main.accounting).toMatchObject({
        tokenType: 'weekly_analysis',
        cycleComplete: false,
      });
      expect(main.messages[0].content).toContain('Do not generate a capsule');
      expect(luna.model).toBe(AiModel.GPT_5_6_LUNA);
      expect(luna.accounting).toMatchObject({
        tokenType: 'weekly_capsule',
        operation: 'generate_weekly_analysis_capsule',
      });
      expect(JSON.parse(luna.messages[1].content).snapshot).toEqual(
        context.snapshot,
      );
      expect(
        JSON.parse(luna.messages[1].content).previousAnalyses,
      ).toBeUndefined();
      expect(luna.messages[0].content).toContain('week for a later MONTHLY');
      expect(luna.messages[0].content).toContain(`maximum ${cap} tokens`);
      expect(report.capsuleGeneration).toMatchObject({
        status: 'ready',
        maxTokens: cap,
      });
      expect(f.ai.completeAiPromptUsageCycle).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ['day', BasePlanIds.LITE_M1, 1200],
    ['day', BasePlanIds.BASE_M1, 1600],
    ['day', BasePlanIds.PRO_M1, 2000],
    ['week', BasePlanIds.LITE_M1, 1100],
    ['week', BasePlanIds.BASE_M1, 1350],
    ['week', BasePlanIds.PRO_M1, 1700],
  ] as ['day' | 'week', BasePlanIds, number][])(
    'recompresses %s capsule only above the %s limit',
    async (kind, plan, maximum) => {
      const f = fixture();
      f.subscriptionUsage.getEffectiveAiBasePlanId.mockResolvedValue(plan);
      f.ai.countStringTokens
        .mockReturnValueOnce(maximum + 1)
        .mockReturnValueOnce(maximum);
      const report = await f.service.generate(
        1,
        kind === 'week' ? weekDto : dto,
      );
      expect(f.ai.executeResponse).toHaveBeenCalledTimes(3);
      expect(report.capsuleGeneration).toMatchObject({
        status: 'ready',
        tokens: maximum,
        attempts: 2,
      });
    },
  );

  it.each([
    'raw',
    'duplicate',
    'future',
    'wrong-zone',
    'outside-week',
    'empty',
  ])('rejects %s day sources before paid work', async (fault) => {
    const f = fixture();
    const request = JSON.parse(JSON.stringify(weekDto));
    const rows = request.snapshot.dailyCapsules;
    if (fault === 'raw') request.snapshot = { days: [] };
    if (fault === 'empty') request.snapshot.dailyCapsules = [];
    if (fault === 'duplicate') rows[1] = rows[0];
    if (fault === 'future') rows[0].asOf = '2099-01-01T00:00:00Z';
    if (fault === 'wrong-zone') rows[0].timezone = 'UTC';
    if (fault === 'outside-week') rows[0].start = rows[0].end = '2026-09-06';
    await expect(f.service.generate(1, request)).rejects.toThrow();
    expect(f.ai.executeResponse).not.toHaveBeenCalled();
  });
  it('makes missing days explicit without manufacturing or dropping available capsules', async () => {
    const f = fixture();
    const request = JSON.parse(JSON.stringify(weekDto));
    request.snapshot.dailyCapsules.pop();
    await f.service.generate(1, request);
    const context = JSON.parse(
      f.ai.executeResponse.mock.calls[0][0].messages[1].content,
    );
    expect(context.snapshot.dailyCapsules).toHaveLength(6);
    expect(context.snapshot.missingDays).toEqual(['2026-09-13']);
  });
});

describe('device-owned periodic analysis', () => {
  it.each([
    [BasePlanIds.LITE_M1, 1200],
    [BasePlanIds.BASE_M1, 1600],
    [BasePlanIds.PRO_M1, 2000],
    [null, 1200],
  ])(
    'accepts the exact daily retry threshold for %s without a second charge',
    async (plan, threshold) => {
      const f = fixture();
      f.subscriptionUsage.getEffectiveAiBasePlanId.mockResolvedValue(plan);
      f.ai.countStringTokens.mockReturnValue(threshold);
      const report = await f.service.generate(1, dto);
      expect(report.capsuleGeneration).toMatchObject({
        status: 'ready',
        tokens: threshold,
        retryAboveTokens: threshold,
        attempts: 1,
      });
      expect(f.ai.executeResponse).toHaveBeenCalledTimes(2);
    },
  );

  it.each([1382, 1600, 1700])(
    'saves the completed Base retry of %i tokens even above the prompt goal or retry threshold',
    async (retryTokens) => {
      const f = fixture();
      f.subscriptionUsage.getEffectiveAiBasePlanId.mockResolvedValue(
        BasePlanIds.BASE_M1,
      );
      f.ai.countStringTokens
        .mockReturnValueOnce(1629)
        .mockReturnValueOnce(retryTokens);
      const response = {
        credits: 10,
        inputTokens: 100,
        cachedInputTokens: 0,
        outputTokens: 100,
        finishReason: 'stop',
      };
      f.ai.executeResponse
        .mockResolvedValueOnce({ ...response, fullText: '{"text":"Analysis"}' })
        .mockResolvedValueOnce({
          ...response,
          fullText: '{"capsule":"First complete capsule"}',
        })
        .mockResolvedValueOnce({
          ...response,
          fullText: '{"capsule":"Second complete capsule"}',
        });
      const report = await f.service.generate(1, dto);
      const status = retryTokens <= 1600 ? 'ready' : 'over_budget';
      expect(report.capsule).toBe('Second complete capsule');
      expect(report.capsuleGeneration).toMatchObject({
        status,
        tokens: retryTokens,
        attempts: 2,
        maxTokens: 1200,
        retryAboveTokens: 1600,
        credits: 20,
      });
      expect(report.credits).toBe(30);
      expect(f.ai.executeResponse).toHaveBeenCalledTimes(3);
      expect(writeContextAudit).toHaveBeenCalledWith(
        'capsule.day.comparison',
        expect.objectContaining({ selectedPass: 2, status }),
      );
    },
  );

  it.each([
    [BasePlanIds.LITE_M1, 2350, 2, 'over_budget'],
    [BasePlanIds.BASE_M1, 2350, 2, 'over_budget'],
    [BasePlanIds.PRO_M1, 2350, 2, 'over_budget'],
    [BasePlanIds.BASE_M1, 1350, 2, 'ready'],
    [BasePlanIds.BASE_M1, 2973, 1, 'over_budget'],
    [BasePlanIds.BASE_M1, 3100, 1, 'over_budget'],
  ] as [BasePlanIds, number, number, 'ready' | 'over_budget'][])(
    'selects the shorter complete weekly capsule for %s, retry %i, pass %i',
    async (plan, retryTokens, selectedPass, status) => {
      const f = fixture();
      f.subscriptionUsage.getEffectiveAiBasePlanId.mockResolvedValue(plan);
      f.ai.countStringTokens
        .mockReturnValueOnce(2973)
        .mockReturnValueOnce(retryTokens);
      const usage = {
        credits: 10,
        inputTokens: 100,
        cachedInputTokens: 0,
        outputTokens: 100,
        finishReason: 'stop',
      };
      f.ai.executeResponse
        .mockResolvedValueOnce({ ...usage, fullText: '{"text":"Analysis"}' })
        .mockResolvedValueOnce({
          ...usage,
          fullText: '{"capsule":"First complete capsule"}',
        })
        .mockResolvedValueOnce({
          ...usage,
          fullText: '{"capsule":"Second complete capsule"}',
        });
      const report = await f.service.generate(1, weekDto);
      expect(report.capsule).toBe(
        selectedPass === 2
          ? 'Second complete capsule'
          : 'First complete capsule',
      );
      expect(report.capsuleGeneration).toMatchObject({
        status,
        tokens: selectedPass === 2 ? retryTokens : 2973,
        originalTokens: 2973,
        credits: 20,
        attempts: 2,
      });
      expect(report.credits).toBe(30);
      expect(f.ai.executeResponse).toHaveBeenCalledTimes(3);
      expect(writeContextAudit).toHaveBeenCalledWith(
        'capsule.week.comparison',
        expect.objectContaining({ selectedPass, status }),
      );
    },
  );

  it('includes fixed source evidence in the retry credit estimate without paid calls', async () => {
    const f = fixture();
    const without = await f.service.estimate(1, dto);
    f.ai.countStringTokens.mockReturnValue(800);
    const withEvidence = await f.service.estimate(1, {
      ...dto,
      snapshot: {
        days: [{ day: dto.start, entries: [{ time: '15:20', mood: '🙂' }] }],
      },
    });
    expect(withEvidence.estimatedMaxCredits).toBeGreaterThan(
      without.estimatedMaxCredits,
    );
    expect(f.ai.executeResponse).not.toHaveBeenCalled();
  });
  it('accepts the daily threshold including fixed evidence without paying for a retry', async () => {
    const f = fixture();
    f.ai.countStringTokens.mockReturnValueOnce(1050).mockReturnValueOnce(1200);
    const report = await f.service.generate(1, {
      ...dto,
      snapshot: {
        days: [
          {
            day: dto.start,
            entries: [{ id: 'one', time: '15:20', mood: '🙂' }],
          },
        ],
      },
    });
    expect(report.capsule).toContain('Mood: 🙂');
    expect(report.capsuleGeneration).toMatchObject({
      status: 'ready',
      attempts: 1,
      tokens: 1200,
    });
    expect(f.ai.executeResponse).toHaveBeenCalledTimes(2);
    expect(writeContextAudit).not.toHaveBeenCalledWith(
      'capsule.day.compression_skipped',
      expect.objectContaining({ fixedEvidenceTokens: 1050 }),
    );
  });
  it('renders epoch and ISO instants locally without changing source data or date-only plans', () => {
    const source = {
      completedAt: 1788955200000,
      date: '2026-09-09T12:00:00Z',
      start: '2026-09-10 09:00',
      day: '2026-09-09',
      text: '12:00Z is a quote',
      nested: [{ timezone: 'UTC', createdAt: 1788955200000 }],
    };
    const before = JSON.stringify(source);
    expect(localizeAnalysisInstants(source, 'Europe/Kiev')).toEqual({
      ...source,
      completedAt: '2026-09-09 15:00 Europe/Kiev',
      date: '2026-09-09 15:00 Europe/Kiev',
      nested: [{ timezone: 'UTC', createdAt: '2026-09-09 12:00 UTC' }],
    });
    expect(JSON.stringify(source)).toBe(before);
  });
  it('preserves source measurements through both passes and budgets the complete capsule', async () => {
    const f = fixture();
    f.ai.countStringTokens
      .mockReturnValueOnce(180)
      .mockReturnValueOnce(1201)
      .mockReturnValueOnce(850);
    f.ai.executeResponse
      .mockResolvedValueOnce({
        fullText: '{"text":"Main answer"}',
        credits: 10,
        inputTokens: 100,
        cachedInputTokens: 0,
        outputTokens: 100,
        finishReason: 'stop',
      })
      .mockResolvedValueOnce({
        fullText: '{"capsule":"A meeting at 14:00; later felt relieved."}',
        credits: 10,
        inputTokens: 100,
        cachedInputTokens: 0,
        outputTokens: 100,
        finishReason: 'stop',
      })
      .mockResolvedValueOnce({
        fullText:
          '{"capsule":"14:00 meeting; relief later.\\n[SOURCE_OBSERVATIONS]Wrong mood[/SOURCE_OBSERVATIONS]"}',
        credits: 10,
        inputTokens: 100,
        cachedInputTokens: 0,
        outputTokens: 100,
        finishReason: 'stop',
      });
    const entry = {
      id: 'e1',
      kind: 'entry',
      time: '15:20',
      mood: '🙂',
      metrics: 'Stress: 2/5',
    };
    const report = await f.service.generate(1, {
      ...dto,
      snapshot: {
        days: [
          {
            day: dto.start,
            entries: [entry, entry, { ...entry, id: 'e2', mood: '😟' }],
            tasks: [{ completedAt: 1788955200000 }],
          },
        ],
      },
    });
    expect(report.capsule).toContain(
      '2026-09-17 | 15:20 | entry | e1: Mood: 🙂; Stress: 2/5',
    );
    expect(report.capsule).toContain('e2: Mood: 😟; Stress: 2/5');
    expect(report.capsule.match(/e1:/g)).toHaveLength(1);
    expect(report.capsule).not.toContain('Wrong mood');
    expect(report.capsuleGeneration).toMatchObject({
      tokens: 850,
      attempts: 2,
      status: 'ready',
    });
    const [main, first, retry] = f.ai.executeResponse.mock.calls.map(
      (call: any[]) => call[0],
    );
    expect(first.messages[0].content).toContain('target 630 tokens');
    expect(retry.messages[0].content).toContain('target 630 tokens');
    // 1201 total minus 180 fixed: compress 1021 prose tokens toward 630.
    expect(retry.messages[0].content).toContain('by approximately 39%');
    expect(report.capsuleGeneration?.reductionPercent).toBe(39);
    expect(retry.messages[1].content).not.toContain('SOURCE_OBSERVATIONS');
    expect(writeContextAudit).toHaveBeenCalledWith(
      'capsule.day.comparison',
      expect.objectContaining({
        reductionBasis: 'prose_excluding_fixed_observations',
        fixedEvidenceTokens: 180,
        actualProseTokenReductionPercent: 34.4,
      }),
    );
    const mainData = main.messages.find((m: any) => m.role === 'user').content;
    const { previousAnalyses: _comparisonHistory, ...currentDay } = JSON.parse(mainData);
    expect(JSON.parse(first.messages.find((m: any) => m.role === 'user').content)).toEqual(currentDay);
    expect(mainData).toContain('2026-09-09 15:00 Europe/Kiev');
    expect(retry.messages).toHaveLength(2);
    expect(retry.messages[1].content).not.toContain('Main answer');
    expect(f.ai.countStringTokens.mock.calls[2][0][0]).toBe(report.capsule);
  });
  it('returns the complete report and Luna capsule without a database or crypto repository', async () => {
    const f = fixture();
    const report = await f.service.generate(1, {
      ...dto,
      createdAt: '2026-09-17T22:00:00+03:00',
    });
    expect(report).toEqual(
      expect.objectContaining({
        status: 'completed',
        createdAt: '2026-09-17T19:00:00.000Z',
        start: dto.start,
        asOf: dto.asOf,
        capsule: 'Synthetic capsule.',
        credits: 40,
        inputTokens: 2000,
        cachedInputTokens: 200,
        outputTokens: 400,
        promptVersion: 2,
        dialogs: [],
        capsuleGeneration: expect.objectContaining({
          status: 'ready',
          tokens: 870,
        }),
      }),
    );
    expect(f.ai.executeResponse).toHaveBeenCalledTimes(2);
    expect(f.ai.executeResponse.mock.calls[1][0].accounting).toEqual(
      expect.objectContaining({
        tokenType: 'daily_capsule',
        cycleComplete: false,
      }),
    );
    await expect(f.service.get(1, report.id)).rejects.toThrow(
      'ANALYSIS_LOCAL_ONLY',
    );
    expect(await f.service.list(1, dto.end)).toEqual([]);
  });
  it('generates a separate brief in the same Luna call, excluding previous days only from capsule input', async () => {
    const f = fixture();
    f.ai.executeResponse.mockResolvedValueOnce({fullText:'{"text":"A useful Nemory hypothesis and suggestion."}',credits:20,inputTokens:1000,cachedInputTokens:0,outputTokens:200,finishReason:'stop'})
      .mockResolvedValueOnce({fullText:'{"capsule":"Current day facts","briefMemory":"Nemory suggested a short pause; result unknown."}',credits:5,inputTokens:500,cachedInputTokens:0,outputTokens:150,finishReason:'stop'});
    const report = await f.service.generate(1,{...dto,previousAnalyses:[prior]});
    expect(report.briefMemory).toContain('result unknown');
    expect(report.briefMemoryUpdatedAt).toBe(dto.asOf);
    expect(report.capsule).toBe('Current day facts');
    expect(f.ai.executeResponse).toHaveBeenCalledTimes(2);
    const [main,luna]=f.ai.executeResponse.mock.calls.map((call:any)=>JSON.parse(call[0].messages[1].content));
    expect(main.previousAnalyses).toHaveLength(1);
    expect(luna.previousAnalyses).toBeUndefined();
    expect(luna.snapshot).toEqual(main.snapshot);
    expect(report.credits).toBe(25);
  });
  it('selects only valid, nonoverlapping locally supplied capsules within asOf', async () => {
    const f = fixture();
    await f.service.generate(1, {
      ...dto,
      previousAnalyses: [
        { ...prior, capsule: '', createdAt: '2026-09-17T18:00:00Z' },
        prior,
        { ...prior, capsule: 'future', createdAt: '2026-09-18T19:00:00Z' },
        { ...prior, capsule: 'wrong timezone', timezone: 'UTC' },
        { ...prior, capsule: 'current day', end: dto.end },
      ],
    });
    expect(
      JSON.parse(f.ai.executeResponse.mock.calls[0][0].messages[1].content)
        .previousAnalyses,
    ).toEqual([
      {
        kind: 'day',
        start: prior.start,
        end: prior.end,
        capsule: prior.capsule,
      },
    ]);
  });
  it('has no hidden historical context when the local database is empty', async () => {
    const f = fixture();
    await f.service.generate(1, dto);
    expect(
      JSON.parse(f.ai.executeResponse.mock.calls[0][0].messages[1].content)
        .previousAnalyses,
    ).toEqual([]);
  });
  it('rejects account mismatch and invalid periods before claiming or charging', async () => {
    const f = fixture();
    await expect(f.service.generate(2, dto)).rejects.toThrow('account changed');
    await expect(
      f.service.generate(1, { ...dto, end: '2026-09-18' }),
    ).rejects.toThrow();
    expect(f.cycles.claimExecution).not.toHaveBeenCalled();
    expect(f.ai.executeResponse).not.toHaveBeenCalled();
  });
  it('blocks concurrent/replayed IDs, but permits explicit regeneration with a new ID', async () => {
    const f = fixture();
    const outcomes = await Promise.allSettled([
      f.service.generate(1, dto),
      f.service.generate(1, dto),
    ]);
    expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(f.ai.executeResponse).toHaveBeenCalledTimes(2);
    await expect(f.service.generate(1, dto)).rejects.toThrow('ALREADY_STARTED');
    await f.service.generate(1, { ...dto, requestId: 'new-request' });
    expect(f.ai.executeResponse).toHaveBeenCalledTimes(4);
  });
  it('does not release an execution claim after a provider failure with uncertain usage', async () => {
    const f = fixture();
    f.ai.executeResponse.mockRejectedValueOnce(new Error('Disconnected'));
    await expect(f.service.generate(1, dto)).rejects.toThrow('Disconnected');
    await expect(f.service.generate(1, dto)).rejects.toThrow('ALREADY_STARTED');
    expect(f.ai.executeResponse).toHaveBeenCalledTimes(1);
  });
  it('does not call a model when already cancelled', async () => {
    const f = fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(
      f.service.generate(1, dto, {
        signal: controller.signal,
        onText: () => {},
      }),
    ).rejects.toThrow();
    expect(f.cycles.claimExecution).not.toHaveBeenCalled();
  });
  it('accepts the completed daily retry above the threshold, including both charges', async () => {
    const f = fixture();
    f.ai.countStringTokens.mockReturnValue(1500);
    const report = await f.service.generate(1, dto);
    expect(report.text).toBe('A supported observation.');
    expect(report.capsule).toBe('Synthetic capsule.');
    expect(report.capsuleGeneration).toEqual(
      expect.objectContaining({
        status: 'over_budget',
        tokens: 1500,
        credits: 40,
        attempts: 2,
      }),
    );
    expect(report.credits).toBe(60);
    expect(f.ai.executeResponse).toHaveBeenCalledTimes(3);
    expect(f.ai.completeAiPromptUsageCycle).toHaveBeenCalledTimes(1);
    expect(writeContextAudit).toHaveBeenCalledWith(
      'capsule.day.comparison',
      expect.objectContaining({ selectedPass: 2, status: 'over_budget' }),
    );
  });
  it.each([600, 810, 899, 900, 1000, 1199, 1200])(
    'accepts a complete %i-token capsule without another paid call',
    async (tokens) => {
      const f = fixture();
      f.ai.countStringTokens.mockReturnValue(tokens);
      const report = await f.service.generate(1, dto);
      expect(report.capsuleGeneration).toMatchObject({
        status: 'ready',
        tokens,
        attempts: 1,
      });
      expect(f.ai.executeResponse).toHaveBeenCalledTimes(2);
    },
  );
  it('compresses just the capsule by a computed percentage and sums actual provider usage', async () => {
    const f = fixture();
    f.ai.countStringTokens.mockReturnValueOnce(1362).mockReturnValueOnce(847);
    f.ai.executeResponse
      .mockResolvedValueOnce({
        fullText: '{"text":"Private main answer"}',
        credits: 10,
        inputTokens: 1000,
        cachedInputTokens: 100,
        outputTokens: 500,
        finishReason: 'stop',
      })
      .mockResolvedValueOnce({
        fullText: '{"capsule":"Original dated facts"}',
        credits: 20,
        inputTokens: 2000,
        cachedInputTokens: 200,
        outputTokens: 1400,
        finishReason: 'stop',
      })
      .mockResolvedValueOnce({
        fullText: '{"capsule":"Compact dated facts"}',
        credits: 5,
        inputTokens: 1500,
        cachedInputTokens: 300,
        outputTokens: 950,
        finishReason: 'stop',
      });
    const report = await f.service.generate(1, dto);
    const retry = f.ai.executeResponse.mock.calls[2][0];
    expect(retry.messages[0].content).toContain('by approximately 41%');
    expect(retry.messages[0].content).toContain('retain about 59%');
    expect(retry.messages[1].content).toBe(
      JSON.stringify({ capsule: 'Original dated facts' }),
    );
    expect(JSON.stringify(retry.messages)).not.toMatch(
      /Private main answer|Synthetic fixture/,
    );
    expect(retry.accounting).toMatchObject({
      traceId: dto.requestId,
      operation: 'compress_daily_analysis_capsule',
      tokenType: 'daily_capsule',
      cycleComplete: false,
    });
    expect(report).toMatchObject({
      capsule: 'Compact dated facts',
      credits: 35,
      inputTokens: 4500,
      cachedInputTokens: 600,
      outputTokens: 2850,
      capsuleGeneration: {
        status: 'ready',
        tokens: 847,
        originalTokens: 1362,
        reductionPercent: 41,
        attempts: 2,
        credits: 25,
      },
    });
    expect(writeContextAudit).toHaveBeenCalledWith(
      'capsule.day.comparison',
      expect.objectContaining({
        requestedReductionPercent: 41,
        actualTokenReductionPercent: 37.8,
        firstPass: expect.objectContaining({
          capsule: 'Original dated facts',
          tokens: 1362,
          credits: 20,
        }),
        secondPass: expect.objectContaining({
          capsule: 'Compact dated facts',
          tokens: 847,
          credits: 5,
        }),
        selectedPass: 2,
        capsuleCredits: 25,
        semanticPreservation: expect.stringContaining(
          'Not automatically verified',
        ),
      }),
    );
  });
  it.each(
    (['day', 'week'] as const).flatMap((kind) =>
      ['invalid-json', 'empty', 'truncated', 'network'].map((failure) => ({
        kind,
        failure,
      })),
    ),
  )(
    'retains the first complete $kind capsule when compression returns $failure',
    async ({ kind, failure }) => {
      const f = fixture();
      f.ai.countStringTokens.mockReturnValue(1362);
      const main = {
        fullText: '{"text":"Answer"}',
        credits: 10,
        inputTokens: 100,
        cachedInputTokens: 0,
        outputTokens: 100,
        finishReason: 'stop',
      };
      f.ai.executeResponse.mockResolvedValueOnce(main).mockResolvedValueOnce({
        ...main,
        fullText: '{"capsule":"Keep this complete capsule"}',
      });
      if (failure === 'network')
        f.ai.executeResponse.mockRejectedValueOnce(new Error('Offline'));
      else
        f.ai.executeResponse.mockResolvedValueOnce({
          ...main,
          fullText:
            failure === 'invalid-json'
              ? '{bad'
              : failure === 'empty'
                ? '{"capsule":""}'
                : '{"capsule":"Cut off"}',
          finishReason: failure === 'truncated' ? 'length' : 'stop',
        });
      const report = await f.service.generate(
        1,
        kind === 'week' ? weekDto : dto,
      );
      expect(report.capsule).toBe('Keep this complete capsule');
      expect(report.capsuleGeneration).toMatchObject({
        status: 'over_budget',
        tokens: 1362,
        attempts: 2,
        credits: failure === 'network' ? 10 : 20,
      });
      expect(report.credits).toBe(failure === 'network' ? 20 : 30);
      expect(f.ai.executeResponse).toHaveBeenCalledTimes(3);
    },
  );
  it('does not re-request an invalid first capsule and preserves the main answer', async () => {
    const f = fixture();
    const response = {
      fullText: '{"text":"Saved answer"}',
      credits: 10,
      inputTokens: 100,
      cachedInputTokens: 0,
      outputTokens: 100,
      finishReason: 'stop',
    };
    f.ai.executeResponse.mockResolvedValueOnce(response).mockResolvedValueOnce({
      ...response,
      fullText: '{incomplete',
      finishReason: 'length',
    });
    const report = await f.service.generate(1, dto);
    expect(report).toMatchObject({
      text: 'Saved answer',
      capsule: '',
      credits: 20,
      capsuleGeneration: { status: 'failed', attempts: 1, credits: 10 },
    });
    expect(f.ai.executeResponse).toHaveBeenCalledTimes(2);
  });
  it('retains the first capsule when cancelled before the compression request', async () => {
    const f = fixture();
    const controller = new AbortController();
    f.ai.countStringTokens.mockReturnValue(1201);
    f.ai.executeResponse
      .mockResolvedValueOnce({
        fullText: '{"text":"Answer"}',
        credits: 10,
        inputTokens: 100,
        cachedInputTokens: 0,
        outputTokens: 100,
        finishReason: 'stop',
      })
      .mockImplementationOnce(async () => {
        controller.abort();
        return {
          fullText: '{"capsule":"Complete first capsule"}',
          credits: 10,
          inputTokens: 100,
          cachedInputTokens: 0,
          outputTokens: 100,
          finishReason: 'stop',
        };
      });
    const report = await f.service.generate(1, dto, {
      signal: controller.signal,
      onText: () => {},
    });
    expect(report).toMatchObject({
      capsule: 'Complete first capsule',
      capsuleGeneration: { status: 'over_budget', tokens: 1201, attempts: 1 },
    });
    expect(f.ai.executeResponse).toHaveBeenCalledTimes(2);
    expect(f.ai.completeAiPromptUsageCycle).toHaveBeenCalledTimes(1);
  });
  it.each(['month'] as const)(
    'rejects oversized current %s evidence without silently discarding days',
    async (kind) => {
      const f = fixture();
      f.ai.countOpenAiTokens.mockReturnValue(80000);
      const base = {
        ...dto,
        kind,
        ...(kind === 'month' ? { start: '2026-09-01', end: '2026-09-30' } : {}),
      };
      const request = {
        ...base,
        previousAnalyses: Array.from({ length: 12 }, (_, i) => {
          const day = '2026-08-' + String(i + 1).padStart(2, '0');
          return {
            ...prior,
            start: day,
            end: day,
            capsule: 'x'.repeat(9000),
          };
        }),
      };
      await expect(f.service.estimate(1, request)).rejects.toThrow(
        'ANALYSIS_CONTEXT_LIMIT',
      );
      await expect(f.service.generate(1, request)).rejects.toThrow(
        'ANALYSIS_CONTEXT_LIMIT',
      );
      expect(f.ai.executeResponse).not.toHaveBeenCalled();
      expect(f.cycles.claimExecution).not.toHaveBeenCalled();
      expect(writeContextAudit).toHaveBeenCalledWith(
        'period.context.selection',
        expect.objectContaining({
          contextTokenLimit: 11500,
          contextTokens: 80000,
        }),
      );
    },
  );
  it('continues a local report with its exact prefix, date and history without mutating it', async () => {
    const f = fixture();
    const report = await f.service.generate(1, dto);
    const original = JSON.stringify(report);
    f.ai.executeResponse.mockResolvedValueOnce({
      fullText: 'Answer',
      credits: 3,
      inputTokens: 50,
      cachedInputTokens: 30,
      outputTokens: 10,
      finishReason: 'stop',
    });
    const next = await f.service.dialog(
      1,
      report.id,
      'turn',
      'Why?',
      undefined,
      '2026-09-18T10:00:00Z',
      report,
    );
    const request = f.ai.executeResponse.mock.calls.at(-1)![0];
    expect(request.messages.slice(0, report.prompt.length)).toEqual(
      report.prompt,
    );
    expect(
      request.messages
        .map((message: any) => message.content)
        .join('\n')
        .split(buildNemoryCapabilitiesPrompt()),
    ).toHaveLength(2);
    expect(
      request.messages.filter(
        (message: any) =>
          message.role === 'system' &&
          message.content.includes(NEMORY_PSYCHOLOGIST_ROLE),
      ),
    ).toHaveLength(1);
    expect(request.messages.at(-1).content).toContain(
      '2026-09-18T10:00:00.000Z',
    );
    expect(next.dialogs[0]).toEqual(
      expect.objectContaining({
        id: 'turn',
        question: 'Why?',
        answer: 'Answer',
        credits: 3,
      }),
    );
    expect(JSON.stringify(report)).toBe(original);
    expect(request.accounting.tokenType).toBe('daily_analysis_dialog');
  });
  it('does not retrieve another account report or invent context for an old client', async () => {
    const f = fixture();
    await expect(
      f.service.dialog(2, 'other-report', 'turn', 'Why?'),
    ).rejects.toThrow('LOCAL_ANALYSIS_CONTEXT_REQUIRED');
    expect(f.ai.executeResponse).not.toHaveBeenCalled();
  });
  it.each(['day', 'week', 'month', 'year'] as const)(
    'grows %s dialog cache beyond the frozen context, retaining prior boundaries',
    async (kind) => {
      const f = fixture();
      let report: LocalAnalysisReport = await f.service.generate(1, dto);
      report = { ...report, kind };
      let previous: any;
      for (let turn = 0; turn < 7; turn++) {
        f.ai.executeResponse.mockResolvedValueOnce({
          fullText: `Answer ${turn}`,
          credits: 1,
          finishReason: 'stop',
        });
        report = await f.service.dialog(
          1,
          report.id,
          `cache-${turn}`,
          `Question ${turn}`,
          undefined,
          `2026-10-0${turn + 1}T10:00:00Z`,
          report,
          turn % 2
            ? []
            : [
                {
                  key: 'rest',
                  text: 'Ask about rest',
                  status: 'open',
                  triggerTags: [],
                },
              ],
        );
        const current = f.ai.executeResponse.mock.calls.at(-1)![0];
        const indexes = current.cache.messageIndexes;
        expect(indexes).toContain(1);
        expect(indexes.length + 1).toBeLessThanOrEqual(4);
        expect(current.messages.slice(0, report.prompt.length)).toEqual(
          report.prompt,
        );
        expect(current.messages.at(-1).content).toContain(
          `2026-10-0${turn + 1}`,
        );
        expect(indexes).not.toContain(current.messages.length - 1);
        const claude = buildAnthropicPromptCachePayload(
          current.messages,
          current.cache.anthropicPrefix,
          indexes,
        );
        if (previous) {
          const boundary = Math.max(...previous.cache.messageIndexes);
          expect(current.cache.key).toBe(previous.cache.key);
          expect(indexes).toContain(boundary);
          expect(Math.max(...indexes)).toBeGreaterThan(boundary);
          expect(current.messages.slice(0, boundary + 1)).toEqual(
            previous.messages.slice(0, boundary + 1),
          );
          const oldClaude = buildAnthropicPromptCachePayload(
            previous.messages,
            previous.cache.anthropicPrefix,
            previous.cache.messageIndexes,
          );
          expect(claude.system).toEqual(oldClaude.system);
          const openai = addExplicitPromptCacheBreakpoint(
            current.messages,
            current.cache.openAiPrefix,
            indexes,
          );
          expect(openai[boundary]).toEqual(
            addExplicitPromptCacheBreakpoint(
              previous.messages,
              previous.cache.openAiPrefix,
              previous.cache.messageIndexes,
            )[boundary],
          );
        }
        previous = current;
      }
    },
  );
  it('rejects malformed local context and mismatched report IDs before generation', async () => {
    const f = fixture();
    const report = await f.service.generate(1, dto);
    f.ai.executeResponse.mockClear();
    for (const context of [
      { ...report, id: 'other' },
      { ...report, prompt: [{ role: 'tool', content: 'x' }] },
      { ...report, model: '__proto__' },
    ]) {
      await expect(
        f.service.dialog(
          1,
          report.id,
          'turn',
          'Why?',
          undefined,
          undefined,
          context as any,
        ),
      ).rejects.toThrow('Invalid local');
    }
    expect(f.ai.executeResponse).not.toHaveBeenCalled();
  });
  it('supports the existing legacy prompt override for reports already saved on device', async () => {
    const f = fixture();
    const report = await f.service.generate(1, dto);
    delete (report as any).promptVersion;
    f.ai.executeResponse.mockResolvedValueOnce({
      fullText: 'Answer',
      credits: 1,
    });
    await f.service.dialog(
      1,
      report.id,
      'turn',
      'Why?',
      undefined,
      undefined,
      report,
    );
    expect(
      f.ai.executeResponse.mock.calls
        .at(-1)![0]
        .messages.some((m: any) => m.content.includes('plain text only')),
    ).toBe(true);
  });
  it.each([undefined, 2] as const)(
    'updates the role for a saved prompt version %s without rewriting its history',
    async (promptVersion) => {
      const f = fixture();
      const report = await f.service.generate(1, dto);
      report.promptVersion = promptVersion;
      report.prompt[0] = {
        role: 'system',
        content:
          'Historical role: supportive companion only. Do not offer hypotheses.',
      };
      const original = JSON.stringify(report);
      f.ai.executeResponse.mockResolvedValueOnce({
        fullText: 'A grounded explanation',
        credits: 1,
      });
      await f.service.dialog(
        1,
        report.id,
        'updated-role',
        'Why?',
        undefined,
        undefined,
        report,
      );
      const messages = f.ai.executeResponse.mock.calls.at(-1)![0].messages;
      expect(messages.slice(0, report.prompt.length)).toEqual(report.prompt);
      const override = messages.find(
        (message: any) =>
          message.role === 'system' &&
          message.content.includes(NEMORY_PSYCHOLOGIST_ROLE),
      );
      expect(override.content).toContain(
        'supersede any conflicting earlier role or restrictions on grounded hypotheses',
      );
      expect(override.content).toContain('Explore grounded hypotheses freely');
      expect(override.content).toContain('no quota on hypotheses');
      expect(
        messages.some((message: any) =>
          message.content.includes(
            'current app capabilities below supersede earlier',
          ),
        ),
      ).toBe(true);
      expect(
        messages.some((message: any) =>
          message.content.includes(buildNemoryCapabilitiesPrompt()),
        ),
      ).toBe(true);
      expect(JSON.stringify(report)).toBe(original);
    },
  );
});

describe('period contracts', () => {
  it('validates nested capsule dates rather than trusting untyped JSON', async () => {
    const good = plainToInstance(PeriodicAnalysisDto, {
      ...dto,
      previousAnalyses: [prior],
    });
    expect(await validate(good)).toHaveLength(0);
    const bad = plainToInstance(PeriodicAnalysisDto, {
      ...dto,
      previousAnalyses: [{ ...prior, createdAt: 'invalid' }],
    });
    expect(await validate(bad)).not.toHaveLength(0);
    const dialog = plainToInstance(PeriodicAnalysisDialogDto, {
      expectedUserId: 1,
      reportId: dto.requestId,
      requestId: dto.requestId,
      question: 'Why?',
      report: {},
    });
    expect(await validate(dialog)).toHaveLength(0); // Deep context validated at the shared service boundary.
  });
  it('retains period validation and local timezone semantics', () => {
    expect(() => validateAnalysisPeriod(dto)).not.toThrow();
    expect(analysisLocalTime('2026-09-09T23:30:00Z', 'Europe/Kiev')).toBe(
      '2026-09-10 02:30',
    );
    expect(() => parseAnalysisResult('{"text":""}', 'day', true)).toThrow();
  });
});
