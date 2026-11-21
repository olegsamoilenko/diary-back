import { AiService } from './ai.service';
import { describe, expect, it, jest } from '@jest/globals';
import { AiModel } from '../users/types';
import { buildNemoryActionsPromptParts } from './utils/nemory-actions-prompt';

jest.mock('../logs/context-audit', () => ({ writeContextAudit: jest.fn() }));
jest.mock('./entry-flow-debug', () => ({
  ...jest.requireActual<typeof import('./entry-flow-debug')>(
    './entry-flow-debug',
  ),
  writeFullServerDebugLog: jest.fn(),
  logServerMemoryReview: jest.fn(),
}));

const cases = [
  {
    frequency: 'weekly',
    count: 3,
    user: 'Завершення після 3 тижнів.',
    assistant: 'З 9 до 29 листопада.',
    end: { type: 'count', count: 3 },
  },
  {
    frequency: 'weekly',
    count: 4,
    user: 'Хочу займатись протягом 4 тижнів.',
    assistant: 'З 9 листопада до 6 грудня.',
    end: { type: 'count', count: 4 },
  },
  {
    frequency: 'daily',
    count: 7,
    user: 'Щоденна звичка на 7 днів.',
    assistant: 'З 9 до 15 листопада.',
    end: { type: 'count', count: 7 },
  },
  {
    frequency: 'weekly',
    user: 'Завершення до 29 листопада 2026 включно.',
    assistant: 'Три тижні руханки.',
    end: { type: 'date', dayLocal: '2026-11-29' },
  },
];

describe.each(['actions', 'assistant', 'dialog'] as const)(
  'habit target period through %s',
  (adapter) => {
    it.each([
      ['daily', 'По 10 карток кожного понеділка, середи та п’ятниці.'],
      ['weekly', 'Сумарно 10 карток за тиждень, займатись у Пн/Ср/Пт.'],
    ])(
      'preserves a mixed batch with a %s target and selected days',
      async (frequency, requestText) => {
        const subject: any = Object.create(AiService.prototype);
        subject.configService = { get: jest.fn(() => AiModel.GPT_5_6_LUNA) };
        subject.buildMemoryCapsuleOutputRules = jest.fn(
          async () => 'Українською',
        );
        subject.countStringTokens = jest.fn(() => 10);
        subject.memoryTagCatalogV2Service = {
          getGroupedCatalog: jest.fn(async () => ({})),
          markUsed: jest.fn(),
        };
        subject.persistAiUsage = jest.fn(async () => undefined);
        subject.completeAiPromptUsageCycle = jest.fn();
        const common = {
          version: 2,
          kind: 'habit',
          startDate: '2026-11-09',
          recurrenceEnd: { type: 'never' },
          showInToday: true,
          showInCalendar: true,
        };
        const actions = [
          {
            ...common,
            title: 'Провітрювати кімнату',
            frequency: 'daily',
            habit: {
              mode: 'count',
              target: 1,
              unit: 'times',
              comparator: 'at_least',
              weeklyMode: 'any_day',
            },
          },
          {
            ...common,
            title: 'Картки англійської',
            frequency,
            habit: {
              mode: 'count',
              target: 10,
              unit: 'custom',
              customUnitLabel: 'карток',
              comparator: 'at_least',
              weeklyMode: 'specific_days',
              daysOfWeek: [1, 3, 5],
            },
          },
        ];
        // Provider output is mocked: verifies delivery of the rule and unchanged parsing,
        // not the model's interpretation of natural language.
        const create = jest.fn(async () => ({
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: JSON.stringify({ plannerCreations: actions }),
              },
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 20 },
        }));
        subject.openai = { chat: { completions: { create } } };
        const dto = {
          userText: `Створи дві звички: провітрювати кімнату щодня раз. ${requestText} Без завершення та нагадувань.`,
          plannerCreationSupported: true,
          plannerCreationVersion: 2,
          currentLocalDate: '2026-11-09',
          currentLocalTime: '12:00',
          timezone: 'Europe/Kyiv',
        };
        const result =
          adapter === 'dialog'
            ? await subject.extractDialogMemoryCapsuleV2(1, {
                ...dto,
                assistantText: 'Створюю дві звички.',
              })
            : await subject.extractAssistantMemoryCapsuleV2(1, {
                ...dto,
                text: 'Створюю дві звички.',
                actionsOnly: adapter === 'actions',
              });
        const request = (create.mock.calls[0] as unknown as [any])[0];
        expect(JSON.stringify(request.messages[0].content)).toContain(
          'Per selected day→daily+habit.daysOfWeek; weekly ONLY for explicit weekly totals, never weekday names',
        );
        expect(JSON.stringify(request.messages)).toContain(requestText);
        expect(result.plannerCreations).toEqual(actions);
        expect(create).toHaveBeenCalledTimes(1);
        expect(subject.persistAiUsage).toHaveBeenCalledTimes(1);
      },
    );
  },
);

it.each(['actions', 'dialog'])(
  'negotiates weekly event intervals through the real %s extraction adapter',
  async (adapter) => {
    const subject: any = Object.create(AiService.prototype);
    subject.configService = { get: jest.fn(() => AiModel.GPT_5_6_LUNA) };
    subject.buildMemoryCapsuleOutputRules = jest.fn(async () => 'Українською');
    subject.countStringTokens = jest.fn(() => 10);
    subject.memoryTagCatalogV2Service = {
      getGroupedCatalog: jest.fn(async () => ({})),
      markUsed: jest.fn(),
    };
    subject.persistAiUsage = jest.fn(async () => undefined);
    subject.completeAiPromptUsageCycle = jest.fn();
    const action = {
      version: 2,
      kind: 'event',
      title: 'Математика',
      startDate: '2026-11-16',
      time: '09:00',
      endTime: '10:30',
      frequency: 'weekly',
      interval: 2,
    };
    const create = jest.fn(async () => ({
      choices: [
        {
          finish_reason: 'stop',
          message: { content: JSON.stringify({ plannerCreations: [action] }) },
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 20 },
    }));
    subject.openai = { chat: { completions: { create } } };
    for (const enabled of [true, false]) {
      const dto = {
        plannerCreationSupported: true,
        plannerCreationVersion: 2,
        eventWeeklyIntervalSupported: enabled,
        userText: 'Створи пару кожні два тижні',
        text: 'Створюю',
        assistantText: 'Створюю',
        actionsOnly: true,
      };
      const result =
        adapter === 'dialog'
          ? await subject.extractDialogMemoryCapsuleV2(1, dto)
          : await subject.extractAssistantMemoryCapsuleV2(1, dto);
      expect(result.plannerCreations).toEqual(enabled ? [action] : []);
      const request = (create.mock.calls.at(-1) as unknown as [any])[0];
      const system = JSON.stringify(request.messages[0].content);
      expect(system.includes('interval?:integer1..52')).toBe(enabled);
    }
  },
);

describe.each(['actions', 'assistant', 'dialog'] as const)(
  'planner period contract through %s',
  (adapter) => {
    it.each(cases)(
      'passes original evidence and preserves the provider end mode: $user',
      async (scenario) => {
        const subject: any = Object.create(AiService.prototype);
        subject.configService = { get: jest.fn(() => AiModel.GPT_5_6_LUNA) };
        subject.usersService = { findById: jest.fn(async () => ({ settings: { conversationLanguage: 'en' } })) };
        subject.countStringTokens = jest.fn(() => 10);
        subject.memoryTagCatalogV2Service = {
          getGroupedCatalog: jest.fn(async () => ({})),
          markUsed: jest.fn(),
        };
        subject.persistAiUsage = jest.fn(async () => undefined);
        subject.completeAiPromptUsageCycle = jest.fn();
        const action = {
          version: 2,
          kind: 'habit',
          title: 'Руханка',
          startDate: '2026-11-09',
          frequency: scenario.frequency,
          recurrenceEnd: scenario.end,
          habit: {
            mode: 'count',
            target: 2,
            unit: 'sessions',
            comparator: 'at_least',
            weeklyMode: 'any_day',
          },
        };
        const create = jest.fn(async () => ({
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: JSON.stringify({ plannerCreations: [action] }),
              },
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 20 },
        }));
        subject.openai = { chat: { completions: { create } } };
        const dto = {
          userText: `Створи звичку. ${scenario.user}`,
          plannerCreationSupported: true,
          plannerCreationVersion: 2,
          plannerContext: JSON.stringify({
            turns: [{ role: 'assistant', text: scenario.assistant }],
          }),
          currentLocalDate: '2026-11-09',
          currentLocalTime: '12:00',
          timezone: 'Europe/Kyiv',
        };
        // Exercise the real provider envelope, parser and normalizer, mocking only network/usage writes.
        const result =
          adapter === 'dialog'
            ? await subject.extractDialogMemoryCapsuleV2(1, {
                ...dto,
                assistantText: scenario.assistant,
              })
            : await subject.extractAssistantMemoryCapsuleV2(1, {
                ...dto,
                text: scenario.assistant,
                actionsOnly: adapter === 'actions',
              });
        expect(create).toHaveBeenCalledTimes(1);
        const request = (create.mock.calls[0] as unknown as [any])[0];
        const textOf = (content: any) =>
          typeof content === 'string'
            ? content
            : content.map((part: any) => part.text ?? '').join('');
        const instructions = textOf(request.messages[0].content);
        expect(request.messages.map((m: any) => textOf(m.content)).join('\n')).toContain('verbatim in their source language');
        expect(instructions).toContain('series durations stay period counts');
        expect(instructions).toContain(
          'daily=days,weekly=weeks,never check-ins',
        );
        expect(instructions).toContain(
          'Preserve explicit user parameters over assistant paraphrases',
        );
        const evidence = textOf(request.messages.at(-1).content);
        expect(evidence).toContain(dto.userText);
        expect(evidence).toContain(scenario.assistant);
        if (adapter !== 'assistant') {
          expect(request.messages.map((m: any) => m.role)).toEqual([
            'system',
            'user',
          ]);
          expect(instructions).not.toContain(dto.userText);
          expect(instructions).not.toContain(scenario.assistant);
        }
        expect(result.plannerCreations).toEqual([action]);
        expect(subject.persistAiUsage).toHaveBeenCalledTimes(1);
        expect(subject.persistAiUsage).toHaveBeenCalledWith(
          expect.objectContaining({ inputTokens: 100, outputTokens: 20 }),
        );
      },
    );
  },
);

it('keeps period context, clarification history and current prose out of V2 action instructions', () => {
  const input = {
    dto: {
      text: 'відповідь',
      plannerCreationSupported: true,
      plannerCreationVersion: 2,
      periodMemoryContext: '{"brief":"приватний підсумок"}',
      plannerContext: 'попереднє уточнення',
      previousAssistantText: 'попередня пропозиція',
    },
    userText: 'поточне прохання',
    assistantText: 'поточний переказ',
    outputLanguageRules: 'Українською',
  };
  const { staticPrompt, dynamicPrompt } = buildNemoryActionsPromptParts(input);
  for (const text of [
    input.dto.periodMemoryContext,
    input.dto.plannerContext,
    input.dto.previousAssistantText,
    input.userText,
    input.assistantText,
  ]) {
    expect(staticPrompt).not.toContain(text);
    expect(dynamicPrompt).toContain(text);
  }
  expect(staticPrompt).toContain('They MUST NOT');
  expect(staticPrompt).toContain('assistantMemory MUST be []');
});
