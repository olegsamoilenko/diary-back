import { describe, expect, it, jest } from '@jest/globals';
import { AiService } from './ai.service';
import { AiModel } from '../users/types';
import { buildNemoryCapabilitiesPrompt } from './utils/nemory-capabilities';

jest.mock('../logs/context-audit', () => ({ writeContextAudit: jest.fn() }));
jest.mock('./entry-flow-debug', () => ({
  ...jest.requireActual<typeof import('./entry-flow-debug')>(
    './entry-flow-debug',
  ),
  writeFullServerDebugLog: jest.fn(),
  logServerMemoryReview: jest.fn(),
}));

const monthly = {
  version: 2,
  kind: 'event',
  title: 'Підсумок бюджету',
  startDate: '2027-01-31',
  allDay: true,
  frequency: 'monthly',
  recurrenceEnd: { type: 'date', dayLocal: '2027-03-31' },
  alerts: [{ mode: 'custom', dayLocal: '2027-01-30', timeLocal: '18:00' }],
};
const question =
  'На яку дату запланувати подію? Напишіть дату тут, щоб продовжити створення.';
const cases: Array<{
  name: string;
  user: string;
  raw: {
    plannerCreations: unknown[];
    plannerCreationError?: string;
    plannerCreationQuestion?: string;
  };
}> = [
  ...['daily', 'weekly'].map((frequency) => ({
    name: `reminder ${frequency} weekday contract`,
    user:
      frequency === 'daily'
        ? 'Створи нагадування «Перевірити навчальну пошту» з 10 листопада 2026 о 15:25 у вівторок, четвер і суботу, усього 5 сповіщень. Опис: «Перевірити зміни в розкладі». Синій #4A90E2, 📬, показуй у Сьогодні й календарі.'
        : 'Створи нагадування «Перевірити навчальну пошту» з 10 листопада 2026 о 15:25 щотижня, усього 5 сповіщень. Опис: «Перевірити зміни в розкладі». Синій #4A90E2, 📬, показуй у Сьогодні й календарі.',
    raw: {
      plannerCreations: [
        {
          version: 2,
          kind: 'reminder',
          title: 'Перевірити навчальну пошту',
          description: 'Перевірити зміни в розкладі',
          startDate: '2026-11-10',
          time: '15:25',
          frequency,
          ...(frequency === 'daily' ? { weekdays: [2, 4, 6] } : {}),
          recurrenceEnd: { type: 'count', count: 5 },
          color: '#4A90E2',
          icon: '📬',
          showInToday: true,
          showInCalendar: true,
        },
      ],
    },
  })),
  {
    name: 'monthly month-end',
    user: 'Створи подію 31 січня 2027 на весь день, щомісяця 31-го, у коротких місяцях в останній день, до 31 березня включно. Нагадуй напередодні о 18:00.',
    raw: { plannerCreations: [monthly] },
  },
  {
    name: 'yearly leap day',
    user: 'Створи подію 29 лютого 2028 на весь день, щороку, 5 повторів. У невисокосні роки 28 лютого.',
    raw: {
      plannerCreations: [
        {
          ...monthly,
          startDate: '2028-02-29',
          frequency: 'yearly',
          recurrenceEnd: { type: 'count', count: 5 },
          alerts: [],
        },
      ],
    },
  },
  {
    name: 'missing essential',
    user: 'Створи подію «Зустріч» без визначеної дати.',
    raw: {
      plannerCreations: [],
      plannerCreationError: 'CLARIFICATION_REQUIRED',
      plannerCreationQuestion: question,
    },
  },
];

// Mock the provider, not the extraction adapters: no network, billing or planner writes.
describe.each(['actions', 'assistant', 'dialog'] as const)(
  'planner recurrence instructions via %s',
  (adapter) => {
    it.each(cases)(
      '$name preserves the result and delivers aligned instructions',
      async ({ user, raw }) => {
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
        const create = jest.fn(async () => ({
          choices: [
            {
              finish_reason: 'stop',
              message: { content: JSON.stringify(raw) },
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 20 },
        }));
        subject.openai = { chat: { completions: { create } } };
        const dto = {
          userText: user,
          plannerCreationSupported: true,
          plannerCreationVersion: 2,
          eventWeeklyIntervalSupported: true,
          currentLocalDate: '2026-11-10',
          currentLocalTime: '12:00',
          timezone: 'Europe/Kyiv',
        };
        const result =
          adapter === 'dialog'
            ? await subject.extractDialogMemoryCapsuleV2(1, {
                ...dto,
                assistantText: 'Обробляю запит.',
              })
            : await subject.extractAssistantMemoryCapsuleV2(1, {
                ...dto,
                text: 'Обробляю запит.',
                actionsOnly: adapter === 'actions',
              });
        const request = (create.mock.calls[0] as unknown as [any])[0];
        const instructions = JSON.stringify(request.messages[0].content);
        expect(instructions).toContain('selected weekdays→frequency:');
        expect(instructions).toContain('weekly/monthly/yearly omit weekdays');
        expect(instructions).toContain(
          'Monthly/yearly: missing day clamps to month-end; retain original day for later repeats.',
        );
        expect(instructions).toContain(
          'One series, no extra events or clarification for this supported rule.',
        );
        expect(instructions).toContain(
          'explicitly asking the user to reply here to continue',
        );
        expect(JSON.stringify(request.messages)).toContain(user);
        expect(result.plannerCreations).toEqual(raw.plannerCreations);
        expect(result.plannerCreationError).toBe(raw.plannerCreationError);
        expect(result.plannerCreationQuestion).toBe(
          raw.plannerCreationQuestion,
        );
        expect(create).toHaveBeenCalledTimes(1);
      },
    );
  },
);

it('exposes event semantics and an explicit clarification action only to V2 creation clients', () => {
  const current = buildNemoryCapabilitiesPrompt(true, true, 'uk', 2, true);
  expect(current).toContain('month/year:min(anchor day,month-end)');
  expect(current).toContain(
    'Ask only what still blocks creation;await reply here.',
  );
  expect(current).toContain('event weekly interval1–52');
  expect(buildNemoryCapabilitiesPrompt(false, false, 'uk')).not.toContain(
    'month/year:missing day',
  );
});
