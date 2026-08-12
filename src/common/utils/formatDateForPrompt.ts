function formatLocalDateForPrompt(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function formatDateForPrompt(ts: number, timeZone?: string): string {
  const d = new Date(ts);
  if (!timeZone) return formatLocalDateForPrompt(d);

  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(d);
    const byType = new Map(parts.map((part) => [part.type, part.value]));
    return `${byType.get('year')}-${byType.get('month')}-${byType.get('day')} ${byType.get('hour')}:${byType.get('minute')}`;
  } catch {
    return formatLocalDateForPrompt(d);
  }
}

export function formatWeekdayForPrompt(ts: number, timeZone?: string): string {
  const date = new Date(ts);
  try {
    return new Intl.DateTimeFormat('en-US', {
      ...(timeZone ? { timeZone } : {}),
      weekday: 'long',
    }).format(date);
  } catch {
    return [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ][date.getDay()];
  }
}
