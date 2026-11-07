/** Wire contract matches the existing client ScheduleRuleV1, not a second scheduler. */
export type ReminderRecurrence = {
  version: 1;
  frequency: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  weekdays?: number[];
  end:
    | { type: 'never' }
    | { type: 'date'; dayLocal: string }
    | { type: 'count'; count: number };
};

export function validReminderDay(day: unknown): day is string {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const ms = Date.parse(day + 'T12:00:00Z');
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === day;
}

/** Reject malformed schedules rather than silently turning them into one-time alerts. */
export function normalizeReminderRecurrence(
  value: unknown,
  origin: string,
): ReminderRecurrence | null {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !validReminderDay(origin)
  )
    return null;
  const r = value as Record<string, unknown>;
  if (
    r.version !== 1 ||
    !['none', 'daily', 'weekly', 'monthly', 'yearly'].includes(
      String(r.frequency),
    )
  )
    return null;
  const interval = r.interval ?? 1;
  if (
    typeof interval !== 'number' ||
    !Number.isInteger(interval) ||
    interval !== 1
  )
    return null;
  const end = (r.end ?? { type: 'never' }) as Record<string, unknown>;
  if (!end || !['never', 'date', 'count'].includes(String(end.type)))
    return null;
  if (
    end.type === 'date' &&
    (!validReminderDay(end.dayLocal) || end.dayLocal < origin)
  )
    return null;
  if (
    end.type === 'count' &&
    (typeof end.count !== 'number' ||
      !Number.isInteger(end.count) ||
      end.count < 1 ||
      end.count > 10000)
  )
    return null;
  let weekdays: number[] | undefined;
  if (r.weekdays !== undefined) {
    if (
      !Array.isArray(r.weekdays) ||
      r.weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7)
    )
      return null;
    weekdays = [...new Set(r.weekdays as number[])].sort((a, b) => a - b);
    if (weekdays.length && r.frequency !== 'daily') return null;
  }
  if (
    r.frequency === 'none' &&
    (interval !== 1 || end.type !== 'never' || weekdays?.length)
  )
    return null;
  return {
    version: 1,
    frequency: r.frequency as ReminderRecurrence['frequency'],
    interval,
    ...(weekdays?.length ? { weekdays } : {}),
    end:
      end.type === 'date'
        ? { type: 'date', dayLocal: end.dayLocal as string }
        : end.type === 'count'
          ? { type: 'count', count: end.count as number }
          : { type: 'never' },
  };
}

export function reminderRecurrenceInstructions(supported = false): string {
  return supported === true
    ? 'Reminders may repeat: return ONE scheduledReminders item per series with optional recurrence:{version:1,frequency:"daily|weekly|monthly|yearly",interval:1,weekdays?:[1..7],end:{type:"never"}|{type:"date",dayLocal:"YYYY-MM-DD"}|{type:"count",count:1..10000}}. Match the manual form: interval is always 1. Selected weekdays use frequency=daily, Monday=1; weekly/monthly/yearly follow the starting date. localDate anchors the series, localTime is its time. Default end=never unless specified; preserve requested bounds. End date is inclusive; count counts notifications including the first, not calendar days. Resolve "for seven days" as an end date, not seven occurrences unless daily. Missing/contradictory timing or unsupported details: omit and clarify, never downgrade to one-time. No per-occurrence copies. Never modify an existing series.'
    : 'This client supports one-time reminders only. Omit recurring requests entirely; never reduce a requested series to one notification.';
}
