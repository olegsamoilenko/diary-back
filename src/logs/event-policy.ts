/** Keep aligned with diary-back/src/logs/event-policy.ts for released clients. */
export function diagnosticLevel(
  name: string,
  level: 'info' | 'warn' | 'error',
) {
  if (level !== 'info') return level;
  if (
    /(?:^|[_.:-])(?:fail|failed|failure|error|fatal|exception)(?:[_.:-]|$)/i.test(
      name,
    )
  )
    return 'error';
  if (/(?:^|[_.:-])(?:warn|warning|timeout)(?:[_.:-]|$)/i.test(name))
    return 'warn';
  return level;
}
export function shouldSendEvent(name: string, level: string): boolean {
  if (level === 'info') level = diagnosticLevel(name, level);
  if (level === 'warn' || level === 'error') return true;
  if (level !== 'info') return false;
  return (
    [
      'app_start',
      'app_close',
      'first_open_started',
      'first_open_db_ready',
      'first_open_anon_ok',
    ].includes(name) ||
    /^onboarding_(?:name|story_[1-4]|appearance|first_entry|first_entry_mood|app|today)_(?:viewed|continued|skipped|back|completed|changed|save_pressed|saved|closed)$/.test(
      name,
    )
  );
}
