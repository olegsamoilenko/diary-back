/** Wire contract shared with the mobile executor. Generate its client copy with
 * scripts/sync-planner-contract.cjs; do not maintain two validators. */
export type CreationEnd =
  | { type: 'never' }
  | { type: 'date'; dayLocal: string }
  | { type: 'count'; count: number };
export type CreationAlert =
  | { mode: 'offset'; offsetMinutes: number }
  | { mode: 'custom'; dayLocal: string; timeLocal: string };
export type PlannerCreationV2 = {
  version: 2;
  kind: 'task' | 'event' | 'habit' | 'goal' | 'checklist' | 'note' | 'reminder';
  title: string;
  description?: string;
  color?: string | null;
  icon?: string | null;
  showInToday?: boolean;
  showInCalendar?: boolean;
  startDate?: string;
  endDate?: string;
  time?: string;
  endTime?: string;
  allDay?: boolean;
  frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval?: number;
  weekdays?: number[];
  recurrenceEnd?: CreationEnd;
  alerts?: CreationAlert[];
  location?: string;
  important?: boolean;
  pinned?: boolean;
  audioReferenceIds?: string[];
  items?: string[];
  milestones?: { title: string; dueDate: string }[];
  goalReminder?: {
    enabled: boolean;
    offsetDays: number;
    hour: number;
    minute: number;
    includeMilestones: boolean;
  };
  habit?: {
    mode: 'check' | 'count' | 'value';
    target: number;
    unit?: string;
    customUnitLabel?: string;
    comparator: 'at_least' | 'at_most';
    weeklyMode: 'any_day' | 'specific_days';
    daysOfWeek?: number[];
    windows?: { startTimeLocal: string; endTimeLocal: string }[];
    reminder?: {
      enabled: boolean;
      time: string;
      additionalTimes?: string[];
      daysOfWeek?: number[];
      offsetMinutes?: number;
    };
  };
};

export const HABIT_CREATION_UNITS = [
  'times',
  'min',
  'hours',
  'km',
  'miles',
  'm',
  'foot',
  'kg',
  'pound',
  'liter',
  'gallon',
  'money',
  'calories',
  'steps',
  'pages',
  'glasses',
  'sessions',
  'tasks',
  'items',
  'calls',
  'custom',
] as const;
type Obj = Record<string, unknown>;
/** Only schema-owned paths and fixed reason codes; never values or arbitrary keys. */
export type PlannerValidationIssue = { path: string; code: string };
export type PlannerValidationReporter = (issue: PlannerValidationIssue) => void;
function rejection(
  report: PlannerValidationReporter | undefined,
  path: string,
  code: string,
): false {
  try {
    report?.({ path, code });
  } catch {
    /* Diagnostics cannot change validation. */
  }
  return false;
}
const obj = (v: unknown): v is Obj =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Obj, allowed: string[]) =>
  Object.keys(v).every((k) => allowed.includes(k));
const text = (v: unknown, max: number) =>
  typeof v === 'string' && !!v.trim() && v.length <= max;
const integer = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
export function creationDay(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
const clock = (v: unknown): v is string =>
  typeof v === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
const days = (v: unknown) =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.length <= 7 &&
  v.every((d) => integer(d, 1, 7)) &&
  new Set(v).size === v.length;
function end(
  v: unknown,
  start: string | undefined,
  report?: PlannerValidationReporter,
  path = '/recurrenceEnd',
) {
  const fail = (field: string, code: string) =>
    rejection(report, path + field, code);
  if (!obj(v)) return fail('', 'EXPECTED_OBJECT');
  if (v.type === 'never')
    return keys(v, ['type']) || fail('/unknownField', 'FIELD_NOT_ALLOWED');
  if (v.type === 'date') {
    if (!keys(v, ['type', 'dayLocal']))
      return fail('/unknownField', 'FIELD_NOT_ALLOWED');
    if (!creationDay(v.dayLocal))
      return fail('/dayLocal', 'INVALID_LOCAL_DATE');
    return (
      !start || v.dayLocal >= start || fail('/dayLocal', 'END_BEFORE_START')
    );
  }
  if (v.type !== 'count') return fail('/type', 'UNSUPPORTED_END_TYPE');
  if (!keys(v, ['type', 'count']))
    return fail('/unknownField', 'FIELD_NOT_ALLOWED');
  return integer(v.count, 1, 10000) || fail('/count', 'INVALID_INTEGER_RANGE');
}
function alert(
  v: unknown,
  report?: PlannerValidationReporter,
  path = '/alerts',
) {
  const fail = (field: string, code: string) =>
    rejection(report, path + field, code);
  if (!obj(v)) return fail('', 'EXPECTED_OBJECT');
  if (v.mode === 'offset') {
    if (!keys(v, ['mode', 'offsetMinutes']))
      return fail('/unknownField', 'FIELD_NOT_ALLOWED');
    return (
      integer(v.offsetMinutes, 0, 525600) ||
      fail('/offsetMinutes', 'INVALID_INTEGER_RANGE')
    );
  }
  if (v.mode !== 'custom') return fail('/mode', 'UNSUPPORTED_ALERT_MODE');
  if (!keys(v, ['mode', 'dayLocal', 'timeLocal']))
    return fail('/unknownField', 'FIELD_NOT_ALLOWED');
  if (!creationDay(v.dayLocal)) return fail('/dayLocal', 'INVALID_LOCAL_DATE');
  return clock(v.timeLocal) || fail('/timeLocal', 'INVALID_LOCAL_TIME');
}
/** null matches the manual form's unrestricted description field. */
export const PLANNER_DESCRIPTION_LIMITS = {
  task: 2000,
  event: 1000,
  reminder: 2000,
  note: 10000,
  goal: null,
  habit: null,
  checklist: null,
} as const;
const common = ['version', 'kind', 'title', 'description', 'color', 'icon'];
const visibility = ['showInToday', 'showInCalendar'];
const recurrence = ['frequency', 'weekdays', 'recurrenceEnd'];
const schedule = ['startDate', 'endDate', 'time', 'endTime', 'allDay'];
const fields: Record<PlannerCreationV2['kind'], string[]> = {
  task: [...visibility, ...schedule, ...recurrence, 'alerts'],
  event: [
    ...visibility,
    ...schedule,
    ...recurrence,
    'alerts',
    'interval',
    'location',
    'important',
  ],
  reminder: [...visibility, 'startDate', 'time', ...recurrence],
  habit: [...visibility, 'startDate', 'frequency', 'recurrenceEnd', 'habit'],
  goal: [...visibility, 'startDate', 'endDate', 'milestones', 'goalReminder'],
  checklist: ['items'],
  note: ['pinned', 'audioReferenceIds'],
};
function valid(
  v: unknown,
  report?: PlannerValidationReporter,
  path = '/plannerCreations',
): v is PlannerCreationV2 {
  const fail = (field: string, code: string) =>
    rejection(report, path + field, code);
  if (!obj(v)) return fail('', 'EXPECTED_OBJECT');
  if (v.version !== 2) return fail('/version', 'UNSUPPORTED_VERSION');
  if (!Object.hasOwn(fields, String(v.kind)))
    return fail('/kind', 'UNSUPPORTED_KIND');
  if (!text(v.title, 60))
    return fail('/title', 'INVALID_NONEMPTY_TEXT_OR_LENGTH');
  const kind = v.kind as PlannerCreationV2['kind'];
  const descriptionLimit = PLANNER_DESCRIPTION_LIMITS[kind];
  if (!keys(v, [...common, ...fields[kind]])) {
    const unexpected = Object.keys(v).find(
      (k) => ![...common, ...fields[kind]].includes(k),
    )!;
    const known = [...common, ...Object.values(fields).flat()].includes(
      unexpected,
    );
    return fail(
      known ? '/' + unexpected : '/unknownField',
      'FIELD_NOT_ALLOWED',
    );
  }
  if (
    v.description !== undefined &&
    (typeof v.description !== 'string' ||
      (descriptionLimit != null && v.description.length > descriptionLimit))
  )
    return fail('/description', 'INVALID_TEXT_OR_LENGTH');
  if (
    v.color !== undefined &&
    v.color !== null &&
    (typeof v.color !== 'string' || !/^#[\da-fA-F]{6}$/.test(v.color))
  )
    return fail('/color', 'INVALID_HEX_COLOR');
  if (v.icon !== undefined && v.icon !== null && !text(v.icon, 32))
    return fail('/icon', 'INVALID_NONEMPTY_TEXT_OR_LENGTH');
  for (const k of [
    'showInToday',
    'showInCalendar',
    'allDay',
    'important',
    'pinned',
  ])
    if (v[k] !== undefined && typeof v[k] !== 'boolean')
      return fail('/' + k, 'EXPECTED_BOOLEAN');
  for (const k of ['startDate', 'endDate'])
    if (v[k] !== undefined && !creationDay(v[k]))
      return fail('/' + k, 'INVALID_LOCAL_DATE');
  for (const k of ['time', 'endTime'])
    if (v[k] !== undefined && !clock(v[k]))
      return fail('/' + k, 'INVALID_LOCAL_TIME');
  const start = v.startDate as string | undefined;
  if (v.endDate && !start) return fail('/startDate', 'REQUIRED_WITH_END_DATE');
  if (v.endDate && start && (v.endDate as string) < start)
    return fail('/endDate', 'END_BEFORE_START');
  if ((v.time || v.endTime) && !start)
    return fail('/startDate', 'REQUIRED_WITH_TIME');
  if ((v.time || v.endTime) && v.allDay === true)
    return fail('/allDay', 'TIME_CONFLICTS_WITH_ALL_DAY');
  if (v.endTime && !v.time) return fail('/time', 'REQUIRED_WITH_END_TIME');
  if (v.allDay === false && !v.time)
    return fail('/time', 'REQUIRED_FOR_TIMED_PLANNER');
  // A timed event with an end date needs an explicit end clock. Do not invent
  // midnight (which can precede its start) or an unrequested duration.
  if (kind === 'event' && v.time && v.endDate && !v.endTime)
    return fail('/endTime', 'REQUIRED_FOR_DATED_TIMED_EVENT');
  if (
    v.endTime &&
    (!v.endDate || v.endDate === start) &&
    (v.endTime as string) < (v.time as string)
  )
    return fail('/endTime', 'END_BEFORE_START');
  if (
    v.frequency !== undefined &&
    (typeof v.frequency !== 'string' ||
      !['daily', 'weekly', 'monthly', 'yearly'].includes(v.frequency))
  )
    return fail('/frequency', 'UNSUPPORTED_FREQUENCY');
  if (
    v.interval !== undefined &&
    (kind !== 'event' ||
      v.frequency !== 'weekly' ||
      typeof v.interval !== 'number' ||
      !Number.isInteger(v.interval) ||
      v.interval < 1 ||
      v.interval > 52)
  )
    return fail('/interval', 'INVALID_EVENT_WEEK_INTERVAL');
  if (v.frequency && !start)
    return fail('/startDate', 'REQUIRED_WITH_FREQUENCY');
  if (
    v.weekdays !== undefined &&
    (v.frequency !== 'daily' || !days(v.weekdays))
  )
    return fail(
      '/weekdays',
      v.frequency !== 'daily' ? 'WEEKDAYS_REQUIRE_DAILY' : 'INVALID_WEEKDAYS',
    );
  if (v.recurrenceEnd !== undefined) {
    if (!v.frequency) return fail('/frequency', 'REQUIRED_WITH_RECURRENCE_END');
    if (!end(v.recurrenceEnd, start, report, path + '/recurrenceEnd'))
      return false;
  }
  if (v.alerts !== undefined) {
    if (!Array.isArray(v.alerts)) return fail('/alerts', 'EXPECTED_ARRAY');
    if (!start) return fail('/startDate', 'REQUIRED_WITH_ALERTS');
    if (!v.alerts.every((a, i) => alert(a, report, path + '/alerts/' + i)))
      return false;
    if (kind === 'task' && v.alerts.length > 1)
      return fail('/alerts', 'TASK_ALERT_LIMIT');
  }
  if (
    Array.isArray(v.alerts) &&
    v.alerts.some((a) => obj(a) && a.mode === 'offset' && !v.time)
  )
    return fail('/time', 'REQUIRED_WITH_OFFSET_ALERT');
  if (kind === 'event' && !start)
    return fail('/startDate', 'REQUIRED_FOR_EVENT');
  if (v.location !== undefined && !text(v.location, 2000))
    return fail('/location', 'INVALID_NONEMPTY_TEXT_OR_LENGTH');
  if (kind === 'reminder' && !start)
    return fail('/startDate', 'REQUIRED_FOR_REMINDER');
  if (kind === 'reminder' && !v.time)
    return fail('/time', 'REQUIRED_FOR_REMINDER');
  if (kind === 'goal') {
    if (!start) return fail('/startDate', 'REQUIRED_FOR_GOAL');
    if (!v.endDate) return fail('/endDate', 'REQUIRED_FOR_GOAL');
    if (v.milestones !== undefined) {
      if (!Array.isArray(v.milestones))
        return fail('/milestones', 'EXPECTED_ARRAY');
      if (
        !v.milestones.every((s, index, stages) => {
          const p = '/milestones/' + index;
          if (!obj(s)) return fail(p, 'EXPECTED_OBJECT');
          if (!keys(s, ['title', 'dueDate']))
            return fail(p + '/unknownField', 'FIELD_NOT_ALLOWED');
          if (!text(s.title, 120))
            return fail(p + '/title', 'INVALID_NONEMPTY_TEXT_OR_LENGTH');
          if (!creationDay(s.dueDate))
            return fail(p + '/dueDate', 'INVALID_LOCAL_DATE');
          if (s.dueDate < start || s.dueDate > String(v.endDate))
            return fail(p + '/dueDate', 'STAGE_OUTSIDE_GOAL_RANGE');
          return (
            index === 0 ||
            s.dueDate >= (stages[index - 1] as { dueDate: string }).dueDate ||
            fail(p + '/dueDate', 'STAGE_DATES_OUT_OF_ORDER')
          );
        })
      )
        return false;
    }
    if (v.goalReminder !== undefined) {
      const r = v.goalReminder;
      if (!obj(r)) return fail('/goalReminder', 'EXPECTED_OBJECT');
      if (
        !keys(r, [
          'enabled',
          'offsetDays',
          'hour',
          'minute',
          'includeMilestones',
        ])
      )
        return fail('/goalReminder/unknownField', 'FIELD_NOT_ALLOWED');
      if (typeof r.enabled !== 'boolean')
        return fail('/goalReminder/enabled', 'EXPECTED_BOOLEAN');
      if (
        ![0, 1, 2, 7].includes(Number(r.offsetDays)) ||
        !integer(r.offsetDays, 0, 7)
      )
        return fail('/goalReminder/offsetDays', 'UNSUPPORTED_DAY_OFFSET');
      if (!integer(r.hour, 0, 23))
        return fail('/goalReminder/hour', 'INVALID_INTEGER_RANGE');
      if (!integer(r.minute, 0, 59))
        return fail('/goalReminder/minute', 'INVALID_INTEGER_RANGE');
      if (typeof r.includeMilestones !== 'boolean')
        return fail('/goalReminder/includeMilestones', 'EXPECTED_BOOLEAN');
    }
  }
  if (kind === 'checklist') {
    if (!Array.isArray(v.items) || !v.items.length)
      return fail('/items', 'EXPECTED_NONEMPTY_ARRAY');
    if (
      !v.items.every(
        (item, i) =>
          text(item, 120) ||
          fail('/items/' + i, 'INVALID_NONEMPTY_TEXT_OR_LENGTH'),
      )
    )
      return false;
  }
  if (kind === 'note') {
    if (
      !text(v.description, 10000) &&
      !(Array.isArray(v.audioReferenceIds) && v.audioReferenceIds.length)
    )
      return fail('/description', 'NOTE_CONTENT_OR_AUDIO_REQUIRED');
    if (
      v.audioReferenceIds !== undefined &&
      (!Array.isArray(v.audioReferenceIds) ||
        !v.audioReferenceIds.every((id) => text(id, 120)) ||
        new Set(v.audioReferenceIds).size !== v.audioReferenceIds.length)
    )
      return fail(
        '/audioReferenceIds',
        'INVALID_OR_DUPLICATE_AUDIO_REFERENCES',
      );
  }
  if (kind === 'habit') {
    const h = v.habit;
    if (!start) return fail('/startDate', 'REQUIRED_FOR_HABIT');
    if (!['daily', 'weekly'].includes(String(v.frequency)))
      return fail('/frequency', 'HABIT_REQUIRES_DAILY_OR_WEEKLY');
    if (!obj(h)) return fail('/habit', 'EXPECTED_OBJECT');
    if (
      !keys(h, [
        'mode',
        'target',
        'unit',
        'customUnitLabel',
        'comparator',
        'weeklyMode',
        'daysOfWeek',
        'windows',
        'reminder',
      ])
    )
      return fail('/habit/unknownField', 'FIELD_NOT_ALLOWED');
    if (!['check', 'count', 'value'].includes(String(h.mode)))
      return fail('/habit/mode', 'UNSUPPORTED_HABIT_MODE');
    if (!['at_least', 'at_most'].includes(String(h.comparator)))
      return fail('/habit/comparator', 'UNSUPPORTED_COMPARATOR');
    if (!['any_day', 'specific_days'].includes(String(h.weeklyMode)))
      return fail('/habit/weeklyMode', 'UNSUPPORTED_WEEKLY_MODE');
    if (
      typeof h.target !== 'number' ||
      !Number.isFinite(h.target) ||
      h.target < 0 ||
      (h.target === 0 && h.comparator !== 'at_most') ||
      (h.mode !== 'value' && !Number.isInteger(h.target))
    )
      return fail('/habit/target', 'INVALID_TARGET_FOR_MODE_OR_COMPARATOR');
    if (h.mode === 'check' && (h.target !== 1 || h.comparator !== 'at_least'))
      return fail('/habit/target', 'CHECK_REQUIRES_ONE_AT_LEAST');
    if (h.mode === 'check' && h.unit !== undefined && h.unit !== 'times')
      return fail('/habit/unit', 'CHECK_REQUIRES_TIMES_UNIT');
    if (
      h.mode === 'count' &&
      h.unit !== undefined &&
      ![
        'times',
        'steps',
        'pages',
        'glasses',
        'sessions',
        'tasks',
        'items',
        'calls',
        'custom',
      ].some((unit) => unit === h.unit)
    )
      return fail('/habit/unit', 'UNIT_NOT_ALLOWED_FOR_COUNT');
    if (
      h.unit !== undefined &&
      !(HABIT_CREATION_UNITS as readonly unknown[]).includes(h.unit)
    )
      return fail('/habit/unit', 'UNSUPPORTED_UNIT');
    if (h.unit === 'custom' && !text(h.customUnitLabel, 30))
      return fail('/habit/customUnitLabel', 'CUSTOM_UNIT_LABEL_REQUIRED');
    if (
      h.customUnitLabel !== undefined &&
      (h.unit !== 'custom' || !text(h.customUnitLabel, 30))
    )
      return fail('/habit/customUnitLabel', 'LABEL_REQUIRES_CUSTOM_UNIT');
    if (h.mode === 'value' && !h.unit)
      return fail('/habit/unit', 'REQUIRED_FOR_VALUE_MODE');
    if (h.daysOfWeek !== undefined && !days(h.daysOfWeek))
      return fail('/habit/daysOfWeek', 'INVALID_WEEKDAYS');
    if (
      v.frequency === 'weekly' &&
      h.weeklyMode === 'specific_days' &&
      !h.daysOfWeek
    )
      return fail('/habit/daysOfWeek', 'REQUIRED_FOR_SPECIFIC_DAYS');
    if (
      v.frequency === 'weekly' &&
      h.weeklyMode === 'any_day' &&
      (h.daysOfWeek || h.windows)
    )
      return fail(
        '/habit/weeklyMode',
        'ANY_DAY_CONFLICTS_WITH_EXECUTION_DAYS_OR_WINDOWS',
      );
    if (h.windows !== undefined) {
      if (!Array.isArray(h.windows) || !h.windows.length)
        return fail('/habit/windows', 'EXPECTED_NONEMPTY_ARRAY');
      let last = '';
      for (const [i, w] of h.windows.entries()) {
        const p = '/habit/windows/' + i;
        if (!obj(w)) return fail(p, 'EXPECTED_OBJECT');
        if (!keys(w, ['startTimeLocal', 'endTimeLocal']))
          return fail(p + '/unknownField', 'FIELD_NOT_ALLOWED');
        if (!clock(w.startTimeLocal))
          return fail(p + '/startTimeLocal', 'INVALID_LOCAL_TIME');
        if (!clock(w.endTimeLocal))
          return fail(p + '/endTimeLocal', 'INVALID_LOCAL_TIME');
        if (w.endTimeLocal <= w.startTimeLocal)
          return fail(p + '/endTimeLocal', 'WINDOW_END_NOT_AFTER_START');
        if (w.startTimeLocal < last)
          return fail(p + '/startTimeLocal', 'WINDOW_OVERLAP_OR_ORDER');
        last = w.endTimeLocal;
      }
    }
    if (h.reminder !== undefined) {
      const r = h.reminder;
      if (!obj(r)) return fail('/habit/reminder', 'EXPECTED_OBJECT');
      if (
        !keys(r, [
          'enabled',
          'time',
          'additionalTimes',
          'daysOfWeek',
          'offsetMinutes',
        ])
      )
        return fail('/habit/reminder/unknownField', 'FIELD_NOT_ALLOWED');
      if (typeof r.enabled !== 'boolean')
        return fail('/habit/reminder/enabled', 'EXPECTED_BOOLEAN');
      if (!clock(r.time))
        return fail(
          '/habit/reminder/time',
          r.time === undefined ? 'REQUIRED_TIME' : 'INVALID_LOCAL_TIME',
        );
      if (
        r.daysOfWeek !== undefined &&
        (v.frequency !== 'weekly' || !days(r.daysOfWeek))
      )
        return fail(
          '/habit/reminder/daysOfWeek',
          v.frequency !== 'weekly'
            ? 'REMINDER_DAYS_REQUIRE_WEEKLY'
            : 'INVALID_WEEKDAYS',
        );
      if (
        r.offsetMinutes !== undefined &&
        (!h.windows || !integer(r.offsetMinutes, 1, 10080))
      )
        return fail(
          '/habit/reminder/offsetMinutes',
          !h.windows ? 'OFFSET_REQUIRES_WINDOWS' : 'INVALID_INTEGER_RANGE',
        );
      if (
        r.additionalTimes !== undefined &&
        (h.windows ||
          !Array.isArray(r.additionalTimes) ||
          !r.additionalTimes.every(clock) ||
          new Set([r.time, ...r.additionalTimes]).size !==
            r.additionalTimes.length + 1)
      )
        return fail(
          '/habit/reminder/additionalTimes',
          h.windows
            ? 'ADDITIONAL_TIMES_CONFLICT_WITH_WINDOWS'
            : 'INVALID_OR_DUPLICATE_TIMES',
        );
    }
  }
  return true;
}

// A bare off switch has the same wire representation as an omitted reminder.
// Preserve any provided schedule fields for normal validation.
function isBareDisabledReminder(value: unknown): boolean {
  return obj(value) && value.enabled === false && keys(value, ['enabled']);
}

/** Atomic validation: no filtering/truncation that could turn a partial plan into success. */
export function normalizePlannerCreationsV2(
  value: unknown,
  report?: PlannerValidationReporter,
): PlannerCreationV2[] {
  if (!Array.isArray(value)) {
    rejection(report, '/plannerCreations', 'EXPECTED_ARRAY');
    return [];
  }
  if (value.length > 6) {
    rejection(report, '/plannerCreations', 'PLANNER_COUNT_LIMIT');
    return [];
  }
  const commands = value.map((item: unknown) => {
    if (!obj(item)) return item;
    if (item.kind === 'goal' && isBareDisabledReminder(item.goalReminder)) {
      const goal = { ...item };
      delete goal.goalReminder;
      return goal;
    }
    if (item.kind === 'habit' && obj(item.habit) && isBareDisabledReminder(item.habit.reminder)) {
      const habit = { ...item.habit };
      delete habit.reminder;
      return { ...item, habit };
    }
    return item;
  });
  if (!commands.every((item, i) => valid(item, report, '/plannerCreations/' + i)))
    return [];
  return JSON.parse(JSON.stringify(commands)) as PlannerCreationV2[];
}
