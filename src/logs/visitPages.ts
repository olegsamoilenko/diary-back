export const VISIT_PAGES = [
  'today',
  'entries',
  'calendar',
  'goals',
  'conversations',
  'progress',
  'community',
  'images',
  'settings',
  'search',
  'help',
  'conversation',
  'periodic-analysis',
  'community-topic',
  'community-rules',
  'community-welcome',
  'media-viewer',
  'settings-metrics',
  'settings-checkins',
  'settings-tabs',
  'settings-theme',
  'settings-custom-theme',
  'settings-font',
  'settings-time',
  'settings-language',
  'settings-model',
  'settings-ai-style',
  'settings-about-me',
  'settings-plans',
  'settings-security',
  'settings-pin',
  'settings-backup',
  'settings-profile',
  'settings-support',
  'settings-about',
  'settings-debug',
  'settings-planner',
  'settings-today',
  'settings-entries',
  'settings-calendar',
  'settings-conversations',
  'entry-detail',
  'task-detail',
  'checkin-detail',
  'reminder-detail',
  'event-detail',
  'habit-detail',
  'goal-detail',
  'checklist-detail',
  'note-detail',
  'search-preview',
] as const;

export type VisitPage = (typeof VISIT_PAGES)[number];

export function firstPageEventName(page: VisitPage): string {
  return 'page_first_open_' + page.replace(/-/g, '_');
}

const pagesByEvent = new Map(
  VISIT_PAGES.map((page) => [firstPageEventName(page), page]),
);

export function pageFromEventName(name: string): VisitPage | undefined {
  return pagesByEvent.get(name);
}
