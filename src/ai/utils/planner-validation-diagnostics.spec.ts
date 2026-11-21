import {
  normalizePlannerCreationsV2,
  PlannerValidationIssue,
} from './planner-creation-v2';
import { normalizePlannerCreationResult } from './planner-creations';
import { writeContextAudit } from '../../logs/context-audit';
import { sanitizeDiagnostic } from '../../logs/sanitizeDiagnostic';
import { PLANNER_CREATION_INSTRUCTIONS_V2 } from './planner-creation-instructions-v2';

jest.mock('../../logs/context-audit', () => ({ writeContextAudit: jest.fn() }));
const audit = jest.mocked(writeContextAudit);

it.each([
  ['time', 'REQUIRED_TIME'],
  ['daysOfWeek', 'REMINDER_DAYS_REQUIRE_WEEKLY'],
])(
  'returns server-owned diagnostics for H01 reminder.%s without private values',
  (field, code) => {
    const action = habit() as any;
    if (field === 'time') delete action.habit.reminder.time;
    else action.habit.reminder.daysOfWeek = [1, 3, 5];
    const result = normalizePlannerCreationResult(
      {
        plannerCreations: [action],
        plannerCreationDiagnostic: {
          reason: 'PRIVATE_FORGED',
          issues: [{ path: 'PRIVATE_PATH', code: 'PRIVATE_CODE' }],
        },
      },
      2,
      [],
      'trace-h01',
    );
    expect(result.plannerCreations).toEqual([]);
    expect(result).toMatchObject({
      plannerCreationDiagnostic: {
        requestId: 'trace-h01',
        reason: 'VALIDATION_REJECTED',
        suppliedCount: 1,
        acceptedCount: 0,
        issues: [{ path: '/plannerCreations/0/habit/reminder/' + field, code }],
      },
    });
    expect(
      JSON.stringify((result as any).plannerCreationDiagnostic),
    ).not.toContain('PRIVATE_');
  },
);

it('states the actual reminder requirements without changing the accepted H01 command', () => {
  expect(PLANNER_CREATION_INSTRUCTIONS_V2).toContain(
    'reminder.time required even with windows: first start minus offsetMinutes',
  );
  expect(PLANNER_CREATION_INSTRUCTIONS_V2).toContain(
    'reminder.daysOfWeek:weekly only; omit for daily',
  );
  expect(normalizePlannerCreationsV2([habit()])).toEqual([habit()]);
});
const habit = () => ({
  version: 2,
  kind: 'habit',
  title: 'Читати для себе',
  description: 'Читаю для задоволення, без поспіху',
  color: '#3366FF',
  icon: 'book-outline',
  showInToday: true,
  showInCalendar: true,
  startDate: '2026-11-09',
  frequency: 'daily',
  recurrenceEnd: { type: 'date', dayLocal: '2026-11-22' },
  habit: {
    mode: 'count',
    target: 20,
    unit: 'pages',
    comparator: 'at_least',
    weeklyMode: 'specific_days',
    daysOfWeek: [1, 3, 5],
    windows: [
      { startTimeLocal: '09:00', endTimeLocal: '09:20' },
      { startTimeLocal: '20:00', endTimeLocal: '20:20' },
    ],
    reminder: { enabled: true, time: '08:45', offsetMinutes: 15 },
  },
});
beforeEach(() => {
  audit.mockReset();
});

it('delivers an explicitly disabled habit reminder like an omitted one to all clients', () => {
  const action = habit();
  const { reminder, ...config } = action.habit;
  const withoutReminder = { ...action, habit: config };
  const explicitOff = { ...action, habit: { ...config, reminder: { enabled: false } } };
  expect(normalizePlannerCreationsV2([explicitOff])).toEqual([withoutReminder]);
  expect(explicitOff.habit.reminder).toEqual({ enabled: false });
  expect(normalizePlannerCreationsV2([explicitOff, {
    ...action, habit: { ...config, reminder: { enabled: reminder.enabled } },
  }])).toEqual([]);
});

it('preserves goal milestones when the only reminder field explicitly turns it off', () => {
  const goal = {
    version: 2, kind: 'goal', title: 'Облаштувати полицю',
    startDate: '2026-11-21', endDate: '2026-12-04',
    milestones: [
      { title: 'Зняти мірки', dueDate: '2026-11-24' },
      { title: 'Закріпити полицю', dueDate: '2026-12-04' },
    ],
  };
  const off = { ...goal, goalReminder: { enabled: false } };
  expect(normalizePlannerCreationsV2([off])).toEqual([goal]);
  expect(off.goalReminder).toEqual({ enabled: false });
  for (const reminder of [{ enabled: true }, { enabled: false, offsetDays: 3 }]) {
    expect(normalizePlannerCreationsV2([off, { ...goal, goalReminder: reminder }])).toEqual([]);
  }
});

it('matches the Series instruction to habit daysOfWeek and other planners weekdays', () => {
  const series = PLANNER_CREATION_INSTRUCTIONS_V2.split('\n').find((line) =>
    line.startsWith('Series:'),
  )!;
  expect(series).toContain(
    'task/event/reminder: selected weekdays→frequency:"daily",weekdays:[1..7](Mon=1); weekly/monthly/yearly omit weekdays. Habit uses habit.daysOfWeek',
  );
  const action = habit();
  const issues: PlannerValidationIssue[] = [];
  expect(
    normalizePlannerCreationsV2([{ ...action, weekdays: [1, 3, 5] }], (issue) =>
      issues.push(issue),
    ),
  ).toEqual([]);
  expect(issues).toEqual([
    { path: '/plannerCreations/0/weekdays', code: 'FIELD_NOT_ALLOWED' },
  ]);
  expect(normalizePlannerCreationsV2([action])).toEqual([action]);
  for (const kind of ['task', 'event', 'reminder']) {
    const other = {
      version: 2,
      kind,
      title: 'Дія',
      startDate: '2026-11-09',
      time: '09:00',
      frequency: 'daily',
      weekdays: [1, 3, 5],
    };
    expect(normalizePlannerCreationsV2([other])).toEqual([other]);
    for (const frequency of ['weekly', 'monthly', 'yearly']) {
      const rejected: PlannerValidationIssue[] = [];
      expect(
        normalizePlannerCreationsV2([{ ...other, frequency }], (issue) =>
          rejected.push(issue),
        ),
      ).toEqual([]);
      expect(rejected).toContainEqual({
        path: '/plannerCreations/0/weekdays',
        code: 'WEEKDAYS_REQUIRE_DAILY',
      });
      const { weekdays, ...withoutDays } = other;
      expect(
        normalizePlannerCreationsV2([{ ...withoutDays, frequency }]),
      ).toEqual([{ ...withoutDays, frequency }]);
    }
  }
});

it('accepts the full H01 command unchanged, without rejection telemetry or input mutation', () => {
  const action = habit();
  const before = JSON.stringify(action);
  const result = normalizePlannerCreationResult(
    { plannerCreations: [action] },
    2,
  );
  expect(result).toEqual({
    plannerCreations: [action],
    scheduledReminders: [],
  });
  expect(result.plannerCreations[0]).not.toBe(action);
  expect(JSON.stringify(action)).toBe(before);
  expect(audit).not.toHaveBeenCalled();
});

it('defines habit frequency by the target period rather than chosen weekdays', () => {
  expect(PLANNER_CREATION_INSTRUCTIONS_V2).toContain(
    'Per selected day→daily+habit.daysOfWeek; weekly ONLY for explicit weekly totals, never weekday names; windows share target',
  );
  expect(PLANNER_CREATION_INSTRUCTIONS_V2).not.toContain(
    'Target is per whole day/week, not per selected day/window',
  );
  for (const frequency of ['daily', 'weekly']) {
    const action = { ...habit(), frequency };
    const result = normalizePlannerCreationResult(
      { plannerCreations: [action] },
      2,
    );
    expect(result.plannerCreations).toEqual([action]);
  }
});

it.each([
  [
    'missing reminder time',
    (a: any) => delete a.habit.reminder.time,
    '/habit/reminder/time',
    'REQUIRED_TIME',
  ],
  [
    'invalid reminder clock',
    (a: any) => (a.habit.reminder.time = '25:00'),
    '/habit/reminder/time',
    'INVALID_LOCAL_TIME',
  ],
  [
    'timed extra clocks',
    (a: any) => (a.habit.reminder.additionalTimes = ['19:45']),
    '/habit/reminder/additionalTimes',
    'ADDITIONAL_TIMES_CONFLICT_WITH_WINDOWS',
  ],
  [
    'daily reminder weekdays',
    (a: any) => (a.habit.reminder.daysOfWeek = [1, 3, 5]),
    '/habit/reminder/daysOfWeek',
    'REMINDER_DAYS_REQUIRE_WEEKLY',
  ],
  [
    'offset out of range',
    (a: any) => (a.habit.reminder.offsetMinutes = 0),
    '/habit/reminder/offsetMinutes',
    'INVALID_INTEGER_RANGE',
  ],
  [
    'overlapping windows',
    (a: any) => (a.habit.windows[1].startTimeLocal = '09:10'),
    '/habit/windows/1/startTimeLocal',
    'WINDOW_OVERLAP_OR_ORDER',
  ],
  [
    'empty window',
    (a: any) => (a.habit.windows[1].endTimeLocal = '20:00'),
    '/habit/windows/1/endTimeLocal',
    'WINDOW_END_NOT_AFTER_START',
  ],
  [
    'invalid calendar date',
    (a: any) => (a.recurrenceEnd.dayLocal = '2026-11-31'),
    '/recurrenceEnd/dayLocal',
    'INVALID_LOCAL_DATE',
  ],
  [
    'end before start',
    (a: any) => (a.recurrenceEnd.dayLocal = '2026-11-08'),
    '/recurrenceEnd/dayLocal',
    'END_BEFORE_START',
  ],
  [
    'root endDate on habit',
    (a: any) => (a.endDate = '2026-11-22'),
    '/endDate',
    'FIELD_NOT_ALLOWED',
  ],
  [
    'target',
    (a: any) => (a.habit.target = 0),
    '/habit/target',
    'INVALID_TARGET_FOR_MODE_OR_COMPARATOR',
  ],
  [
    'custom missing label',
    (a: any) => (a.habit.unit = 'custom'),
    '/habit/customUnitLabel',
    'CUSTOM_UNIT_LABEL_REQUIRED',
  ],
] as [string, (action: any) => unknown, string, string][])(
  'reports the exact first failing rule for %s and rejects the whole batch',
  (_, mutate, path, code) => {
    const action = habit();
    mutate(action);
    const result = normalizePlannerCreationResult(
      { plannerCreations: [{ version: 2, kind: 'task', title: 'OK' }, action] },
      2,
      [],
      'test-h01',
    );
    expect(result.plannerCreations).toEqual([]);
    expect(result).toMatchObject({
      plannerCreationError: 'CLARIFICATION_REQUIRED',
    });
    expect(audit).toHaveBeenCalledWith(
      'nemory.planners.validation',
      expect.objectContaining({
        requestId: 'test-h01',
        reason: 'VALIDATION_REJECTED',
        suppliedCount: 2,
        acceptedCount: 0,
        issues: [{ path: '/plannerCreations/1' + path, code }],
      }),
    );
  },
);

it('distinguishes model clarification, preserving its existing question only in the response', () => {
  const question = 'Приватне запитання';
  const result = normalizePlannerCreationResult(
    {
      plannerCreations: [],
      plannerCreationError: 'private-model-error',
      plannerCreationQuestion: question,
    },
    2,
  );
  expect(result).toMatchObject({ plannerCreationQuestion: question });
  expect(audit).toHaveBeenCalledWith(
    'nemory.planners.validation',
    expect.objectContaining({
      reason: 'MODEL_REQUESTED_CLARIFICATION',
      hasClarificationQuestion: true,
      issues: [],
    }),
  );
  expect(JSON.stringify(audit.mock.calls)).not.toContain(question);
  expect(JSON.stringify(audit.mock.calls)).not.toContain('private-model-error');
});

it.each([undefined, null, {}, 'private-string', new Array(7).fill(habit())])(
  'reports invalid collection shapes without values',
  (value) => {
    normalizePlannerCreationResult({ plannerCreations: value }, 2);
    expect(audit.mock.calls[0][1]).toMatchObject({
      issues: [
        {
          path: '/plannerCreations',
          code: Array.isArray(value) ? 'PLANNER_COUNT_LIMIT' : 'EXPECTED_ARRAY',
        },
      ],
    });
    expect(JSON.stringify(audit.mock.calls)).not.toContain('private-string');
  },
);

it('reports unauthorized audio without recording audio IDs', () => {
  normalizePlannerCreationResult(
    {
      plannerCreations: [
        {
          version: 2,
          kind: 'note',
          title: 'Private',
          audioReferenceIds: ['private-media-id'],
        },
      ],
    },
    2,
  );
  expect(audit.mock.calls[0][1]).toMatchObject({
    issues: [
      {
        path: '/plannerCreations/0/audioReferenceIds',
        code: 'AUDIO_REFERENCE_NOT_AUTHORIZED',
      },
    ],
  });
  expect(JSON.stringify(audit.mock.calls)).not.toContain('private-media-id');
});

it('keeps diagnostic paths through the real privacy projection without leaking arbitrary keys or values', () => {
  const action = {
    ...habit(),
    'private-person@example.com': 'secret-health-detail',
  };
  normalizePlannerCreationResult(
    { plannerCreations: [action] },
    2,
    [],
    'test-h01',
  );
  const event = audit.mock.calls[0][1];
  expect(sanitizeDiagnostic(event)).toEqual(event);
  const serialized = JSON.stringify(event);
  for (const privateString of [
    'private-person',
    'secret-health-detail',
    action.title,
    action.description,
  ])
    expect(serialized).not.toContain(privateString);
  expect(event).toMatchObject({
    issues: [
      { path: '/plannerCreations/0/unknownField', code: 'FIELD_NOT_ALLOWED' },
    ],
  });
});

it('does not let broken diagnostic sinks change validation or responses', () => {
  const invalid = { ...habit(), color: 'blue' };
  expect(
    normalizePlannerCreationsV2([invalid], () => {
      throw Error('sink failure');
    }),
  ).toEqual([]);
  audit.mockImplementation(() => {
    throw Error('sink failure');
  });
  expect(
    normalizePlannerCreationResult({ plannerCreations: [invalid] }, 2),
  ).toMatchObject({ plannerCreationError: 'CLARIFICATION_REQUIRED' });
});

it('does not alter legacy client normalization', () => {
  expect(
    normalizePlannerCreationResult({
      plannerCreations: [{ kind: 'task', title: 'Legacy' }],
    }),
  ).toEqual({ plannerCreations: [{ kind: 'task', title: 'Legacy' }] });
  expect(audit).not.toHaveBeenCalled();
});

it('reports indices for nested stages and alert fields', () => {
  const issues: PlannerValidationIssue[] = [];
  normalizePlannerCreationsV2(
    [
      {
        version: 2,
        kind: 'goal',
        title: 'Goal',
        startDate: '2026-11-09',
        endDate: '2026-11-22',
        milestones: [{ title: 'Stage', dueDate: '2026-11-23' }],
      },
    ],
    (i) => issues.push(i),
  );
  expect(issues).toEqual([
    {
      path: '/plannerCreations/0/milestones/0/dueDate',
      code: 'STAGE_OUTSIDE_GOAL_RANGE',
    },
  ]);
  issues.length = 0;
  normalizePlannerCreationsV2(
    [
      {
        version: 2,
        kind: 'event',
        title: 'Event',
        startDate: '2026-11-09',
        time: '09:00',
        alerts: [
          { mode: 'custom', dayLocal: '2026-11-09', timeLocal: '99:00' },
        ],
      },
    ],
    (i) => issues.push(i),
  );
  expect(issues).toEqual([
    {
      path: '/plannerCreations/0/alerts/0/timeLocal',
      code: 'INVALID_LOCAL_TIME',
    },
  ]);
});
import { beforeEach, expect, it, jest } from '@jest/globals';
