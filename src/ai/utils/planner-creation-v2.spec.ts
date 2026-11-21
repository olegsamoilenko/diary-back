import { normalizePlannerCreationsV2 as normalize } from './planner-creation-v2';
import {
  normalizePlannerCreations,
  normalizePlannerCreationResult,
  plannerCreationInstructions,
} from './planner-creations';

it('requires an end clock for a timed event with an explicit end date', () => {
  const event = {
    version: 2,
    kind: 'event',
    title: 'Зустріч',
    startDate: '2027-02-01',
    time: '18:00',
  };
  expect(normalize([{ ...event, endDate: event.startDate }])).toEqual([]);
  expect(normalize([{ ...event, endDate: '2027-02-02' }])).toEqual([]);
  expect(normalize([event])).toHaveLength(1);
  expect(
    normalize([{ ...event, endDate: event.startDate, endTime: '19:00' }]),
  ).toHaveLength(1);
  expect(
    normalize([{ ...event, endDate: '2027-02-02', endTime: '00:00' }]),
  ).toHaveLength(1);
  expect(
    normalize([
      { ...event, time: undefined, allDay: true, endDate: event.startDate },
    ]),
  ).toHaveLength(1);
});

it('returns a concrete clarification and no partial commands', () => {
  const result = normalizePlannerCreationResult(
    {
      plannerCreations: [],
      plannerCreationError: 'CLARIFICATION_REQUIRED',
      plannerCreationQuestion: 'Який дедлайн другого етапу?',
    },
    2,
  );
  expect(result).toMatchObject({
    plannerCreations: [],
    scheduledReminders: [],
    plannerCreationQuestion: 'Який дедлайн другого етапу?',
  });
});
it('keeps multi-turn creation evidence in the action-only prompt, without authorizing historical replay', () => {
  const prompt = buildNemoryActionsPrompt({
    dto: {
      plannerCreationSupported: true,
      plannerCreationVersion: 2,
      plannerContext: 'Перший етап до 10 грудня',
    } as never,
    userText: 'Другий до 20 грудня',
    assistantText: 'Створюю',
    outputLanguageRules: 'Українською',
  });
  expect(prompt).toContain('Перший етап до 10 грудня');
  expect(prompt).toContain('never authorization to replay');
  expect(plannerCreationInstructions(2)).toContain('plannerCreationQuestion');
});
it.each([
  {
    version: 2,
    kind: 'task',
    title: 'Завдання',
    description: 'я'.repeat(2001),
  },
  {
    version: 2,
    kind: 'habit',
    title: 'Дзвінки',
    startDate: '2027-01-01',
    frequency: 'daily',
    habit: {
      mode: 'count',
      target: 1.5,
      comparator: 'at_least',
      weeklyMode: 'any_day',
    },
  },
  {
    version: 2,
    kind: 'habit',
    title: 'Обсяг',
    startDate: '2027-01-01',
    frequency: 'daily',
    habit: {
      mode: 'value',
      target: 1,
      unit: 'custom',
      customUnitLabel: 'я'.repeat(31),
      comparator: 'at_least',
      weeklyMode: 'any_day',
    },
  },
])(
  'rejects native form limits without truncating the user request: %j',
  (action) => expect(normalize([action])).toEqual([]),
);
import { buildNemoryCapabilitiesPrompt } from './nemory-capabilities';
import { buildNemoryActionsPrompt } from './nemory-actions-prompt';

it('keeps the user end mode despite a dated assistant paraphrase in the extraction context', () => {
  const userText =
    'Створи звичку: 2 заняття на тиждень, початок 9 листопада, завершення після 3 тижнів.';
  const assistantText = 'Створю звичку від 9 до 29 листопада.';
  const prompt = buildNemoryActionsPrompt({
    dto: { plannerCreationSupported: true, plannerCreationVersion: 2 } as never,
    userText,
    assistantText,
    outputLanguageRules: 'Українською',
  });
  const instructions = plannerCreationInstructions(2);
  expect(prompt).toContain(userText);
  expect(prompt).toContain(assistantText);
  expect(instructions).toContain(
    'Preserve explicit user parameters over assistant paraphrases',
  );
  expect(instructions).toContain('series durations stay period counts');
  expect(instructions).toContain(
    'requested repetitions/period duration→count; user-specified end date→date',
  );
  expect(instructions).toContain(
    'Habit recurrenceEnd.count counts frequency periods: daily=days,weekly=weeks,never check-ins',
  );
  expect(buildNemoryCapabilitiesPrompt(true, true, 'uk', 2)).toContain(
    'Keep settings/period counts≠dates',
  );
});

it.each([
  { type: 'count', count: 3 },
  { type: 'date', dayLocal: '2026-11-29' },
])(
  'preserves the requested H03 end mode without substituting the equivalent mode: %j',
  (recurrenceEnd) => {
    const action = {
      version: 2,
      kind: 'habit',
      title: 'Руханка двічі на тиждень',
      startDate: '2026-11-09',
      frequency: 'weekly',
      recurrenceEnd,
      habit: {
        mode: 'count',
        target: 2,
        unit: 'sessions',
        comparator: 'at_least',
        weeklyMode: 'any_day',
        reminder: { enabled: true, time: '19:00', daysOfWeek: [2, 4] },
      },
    };
    const before = JSON.stringify(action);
    const result = normalizePlannerCreationResult(
      { plannerCreations: [action] },
      2,
    );
    expect(result.plannerCreations).toEqual([action]);
    expect(JSON.stringify(action)).toBe(before);
  },
);

const task = {
  version: 2,
  kind: 'task',
  title: 'Підготувати документи',
  startDate: '2027-02-01',
  endDate: '2027-02-02',
  time: '09:00',
  endTime: '17:00',
  frequency: 'weekly',
  recurrenceEnd: { type: 'count', count: 3 },
  alerts: [{ mode: 'offset', offsetMinutes: 30 }],
  showInToday: false,
  showInCalendar: true,
  color: '#008800',
  icon: '📂',
};
const habit = {
  version: 2,
  kind: 'habit',
  title: 'Читання',
  startDate: '2027-02-01',
  frequency: 'weekly',
  recurrenceEnd: { type: 'count', count: 4 },
  habit: {
    mode: 'value',
    target: 90,
    unit: 'min',
    comparator: 'at_least',
    weeklyMode: 'specific_days',
    daysOfWeek: [1, 3, 5],
    windows: [
      { startTimeLocal: '09:00', endTimeLocal: '10:00' },
      { startTimeLocal: '17:00', endTimeLocal: '18:00' },
    ],
    reminder: { enabled: true, time: '08:45', offsetMinutes: 15 },
  },
};

it.each([
  task,
  habit,
  {
    version: 2,
    kind: 'task',
    title: 'Без дати',
    description: '- [ ] Перший\n- [ ] Другий',
  },
  {
    version: 2,
    kind: 'event',
    title: 'Бюджет',
    startDate: '2027-02-01',
    time: '19:00',
    endTime: '20:00',
    location: 'Вдома',
    important: true,
    frequency: 'monthly',
    recurrenceEnd: { type: 'date', dayLocal: '2027-06-01' },
    alerts: [
      { mode: 'offset', offsetMinutes: 15 },
      { mode: 'custom', dayLocal: '2027-01-31', timeLocal: '18:00' },
    ],
  },
  {
    version: 2,
    kind: 'reminder',
    title: 'Вазони',
    description: 'Перевірити ґрунт',
    startDate: '2027-02-01',
    time: '10:00',
    frequency: 'daily',
    weekdays: [1, 3, 5],
    recurrenceEnd: { type: 'count', count: 3 },
  },
  {
    version: 2,
    kind: 'goal',
    title: 'Портфоліо',
    startDate: '2027-02-01',
    endDate: '2027-02-28',
    milestones: [{ title: 'Добірка', dueDate: '2027-02-15' }],
    goalReminder: {
      enabled: true,
      offsetDays: 2,
      hour: 10,
      minute: 30,
      includeMilestones: true,
    },
  },
  {
    version: 2,
    kind: 'checklist',
    title: 'Збори',
    items: Array.from({ length: 60 }, (_, i) => `Пункт ${i}`),
  },
  {
    version: 2,
    kind: 'note',
    title: 'Домовленості',
    description: '**Важливо**\n\n- [ ] Перший\n- Другий',
    pinned: true,
    audioReferenceIds: ['approved-audio'],
  },
  {
    ...habit,
    habit: {
      mode: 'count',
      target: 0,
      comparator: 'at_most',
      weeklyMode: 'any_day',
      reminder: {
        enabled: true,
        time: '18:00',
        additionalTimes: ['21:00'],
        daysOfWeek: [1, 2, 3],
      },
    },
  },
])('preserves every authorized field of $kind', (action) =>
  expect(normalize([action])).toEqual([action]),
);

it.each([
  { ...task, unknownSetting: true },
  { ...task, priority: 'high' },
  { ...task, recurrenceEnd: { type: 'count', count: 0 } },
  { ...task, recurrenceEnd: { type: 'date', dayLocal: '2027-01-01' } },
  { ...task, recurrenceEnd: { type: 'date', dayLocal: '2027-02-30' } },
  { ...task, weekdays: [1, 3] },
  { ...task, frequency: 'daily', weekdays: [1, 1] },
  { ...task, allDay: true },
  { ...task, time: '25:00' },
  {
    ...task,
    alerts: [
      { mode: 'offset', offsetMinutes: 15 },
      { mode: 'offset', offsetMinutes: 30 },
    ],
  },
  { ...habit, habit: { ...habit.habit, target: -1 } },
  { ...habit, habit: { ...habit.habit, mode: 'check' } },
  { ...habit, habit: { ...habit.habit, weeklyMode: 'any_day' } },
  { ...habit, habit: { ...habit.habit, unit: 'custom' } },
  {
    ...habit,
    habit: {
      ...habit.habit,
      windows: [{ startTimeLocal: '11:00', endTimeLocal: '09:00' }],
    },
  },
  {
    version: 2,
    kind: 'goal',
    title: 'Ціль',
    startDate: '2027-02-01',
    endDate: '2027-02-28',
    milestones: [{ title: 'Без дати' }],
  },
  {
    version: 2,
    kind: 'note',
    title: 'Нотатка',
    description: 'Текст',
    showInToday: true,
  },
  {
    version: 2,
    kind: 'reminder',
    title: 'Нагадування',
    startDate: '2027-02-01',
  },
])('rejects entire batch rather than lose settings: %#', (invalid) =>
  expect(
    normalize([{ version: 2, kind: 'task', title: 'Коректне' }, invalid]),
  ).toEqual([]),
);

it('rejects seven actions atomically, but keeps duplicate checklist items in order', () => {
  expect(normalize(Array.from({ length: 7 }, () => task))).toEqual([]);
  const a = {
    version: 2,
    kind: 'checklist',
    title: 'Список',
    items: ['Ключі', 'Квиток', 'Ключі'],
  };
  expect(normalize([a])).toEqual([a]);
});
it('negotiates old and new contracts without extending an older client', () => {
  expect(plannerCreationInstructions()).not.toContain('PLANNER CREATIONS v2');
  expect(plannerCreationInstructions(2)).toContain('PLANNER CREATIONS v2');
  expect(normalizePlannerCreations([task], 2)).toEqual([task]);
  expect(normalizePlannerCreations([task])).toEqual([]);
  expect(
    normalizePlannerCreations([{ kind: 'task', title: 'Старий' }]),
  ).toEqual([{ kind: 'task', title: 'Старий' }]);
  expect(buildNemoryCapabilitiesPrompt(true, true, 'uk')).not.toContain(
    'windows',
  );
  expect(buildNemoryCapabilitiesPrompt(false, true, 'uk', 2)).not.toContain(
    'windows',
  );
  expect(buildNemoryCapabilitiesPrompt(true, true, 'uk', 2)).toContain(
    'windows',
  );
});
it('keeps preceding proposal as evidence for a short acceptance in action-only conversations', () => {
  const p = buildNemoryActionsPrompt({
    dto: {
      text: 'Створюю',
      previousAssistantText: 'Запропонований список із трьох пунктів',
    },
    userText: 'Так',
    assistantText: 'Створюю',
    outputLanguageRules: '',
  });
  expect(p).toContain('Запропонований список із трьох пунктів');
});
import { it, expect } from '@jest/globals';

it.each([
  'times',
  'steps',
  'pages',
  'glasses',
  'sessions',
  'tasks',
  'items',
  'calls',
  'custom',
])('preserves manual count unit %s', (unit) => {
  const action = {
    ...habit,
    habit: {
      mode: 'count',
      target: 2,
      unit,
      comparator: 'at_least',
      weeklyMode: 'any_day',
      ...(unit === 'custom' ? { customUnitLabel: 'підходів' } : {}),
    },
  };
  expect(normalize([action])).toEqual([action]);
});
it('rejects decreasing stage dates without sorting or partially saving them', () => {
  const goal = {
    version: 2,
    kind: 'goal',
    title: 'Підготовка',
    startDate: '2027-01-01',
    endDate: '2027-01-31',
    milestones: [
      { title: 'Перший', dueDate: '2027-01-20' },
      { title: 'Другий', dueDate: '2027-01-10' },
    ],
  };
  expect(normalize([goal])).toEqual([]);
  for (const day of ['2027-01-20', '2027-01-21'])
    expect(
      normalize([
        {
          ...goal,
          milestones: [goal.milestones[0], { title: 'Другий', dueDate: day }],
        },
      ]),
    ).toHaveLength(1);
});

it.each([
  ['task', 2000],
  ['event', 1000],
  ['reminder', 2000],
  ['note', 10000],
] as [string, number][])(
  'matches manual %s description limit without truncation',
  (kind, limit) => {
    const action = {
      version: 2,
      kind,
      title: 'Перевірка',
      startDate: '2027-02-01',
      ...(kind === 'reminder' ? { time: '10:00' } : {}),
    };
    if (kind === 'note') delete (action as any).startDate;
    expect(
      normalize([{ ...action, description: 'а'.repeat(limit) }])[0]
        ?.description,
    ).toBe('а'.repeat(limit));
    expect(
      normalizePlannerCreationResult(
        {
          plannerCreations: [{ ...action, description: 'а'.repeat(limit + 1) }],
        },
        2,
      ),
    ).toMatchObject({
      plannerCreations: [],
      plannerCreationError: 'CLARIFICATION_REQUIRED',
    });
  },
);
it.each(['goal', 'habit', 'checklist'])(
  'preserves a long %s description supported by the manual form',
  (kind) => {
    const action = {
      version: 2,
      kind,
      title: 'Перевірка',
      description: 'а'.repeat(10001),
      ...(kind === 'checklist'
        ? { items: ['Перший пункт'] }
        : { startDate: '2027-02-01' }),
      ...(kind === 'goal' ? { endDate: '2027-02-05' } : {}),
      ...(kind === 'habit'
        ? {
            frequency: 'daily',
            habit: {
              mode: 'count',
              target: 1,
              comparator: 'at_least',
              weeklyMode: 'any_day',
            },
          }
        : {}),
    };
    expect(normalize([action])[0]?.description).toBe(action.description);
  },
);
