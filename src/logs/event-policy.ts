import { pageFromEventName } from './visitPages';

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
// Older clients may still upload a saved summary of automatic retries.
function isBackgroundSummary(name: string, data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (d.state !== 'recovered' && d.state !== 'interrupted') return false;
  if (typeof d.count !== 'number' || !Array.isArray(d.sources)) return false;
  if (name === 'socket_connection_failed' || name === 'ads_access_check_failed')
    return true;
  if (name !== 'request_error') return false;
  switch (d.url) {
    case '/forum/profiles/me':
      return d.component === '_Layout';
    case '/subscriptions/me':
      return d.component === 'AdvertisingProvider';
    case '/forum/unread/summary':
      return d.component === 'useCommunitySync';
    case '/release-notifications/latest':
      return d.component === 'ReleaseNotificationModal';
    case '/common-notifications/latest':
      return d.component === 'CommonNotificationModal';
    case '/push-notifications/reminders/upcoming':
      return true;
    default:
      return false;
  }
}

export function shouldSendEvent(
  name: string,
  level: string,
  data?: unknown,
): boolean {
  if (name.startsWith('page_first_open_'))
    return level === 'info' && !!pageFromEventName(name);
  // Released clients reported normal sheet animation timers as timeouts.
  if (/^(?:vfe|add)_sheet_close_TIMEOUT_(?:START|END)$/.test(name))
    return false;
  if (
    name === 'planner_creation_rejected' &&
    data &&
    typeof data === 'object' &&
    'backend' in data
  ) {
    const backend = data.backend;
    if (
      backend &&
      typeof backend === 'object' &&
      'reason' in backend &&
      backend.reason === 'MODEL_REQUESTED_CLARIFICATION'
    )
      return false;
  }
  if (isBackgroundSummary(name, data)) return false;
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
