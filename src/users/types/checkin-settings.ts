import { BadRequestException } from '@nestjs/common';
import type { MetricTracking } from './metric-tracking';
export type CheckinSettings = {
  version: 1;
  templates: { id: string; title: string | null; icon?: string; deleted: boolean; metricIds: string[]; questions: { id: string; text: string | null }[] }[];
};
const DEFAULT_QUESTIONS: Record<string, string[]> = {
  daily: ['mostImportant'], photoMoment: [], beforeSleep: ['wentWell','gratefulFor','takeTomorrow','leaveHere'],
  morning: ['howFeel','mainThing','mood'], strongEmotion: ['whatHappened','emotion','trigger','reaction'],
  anxiety: ['fear','realistic','todayAction'], conflict: ['withWhom','whatHappened','felt','wouldSay'],
  achievement: ['workedOut','proudOf','helped'], idea: ['name','description','whyInteresting'],
  decision: ['decision','pros','cons'], selfReflection: ['repeating','meaning'], habit: ['habit','helped','blocked'],
  dailyWin: ['win','meaning'], badDay: ['hardest','different'], inspiration: ['inspired','why'], goal: ['workingOn','nextStep'],
};
for (const [id, questions] of Object.entries(DEFAULT_QUESTIONS)) {
  if (id !== 'daily' && id !== 'photoMoment') questions.push('extraNotes');
}
const ICONS = ["document-text-outline", "partly-sunny-outline", "bed-outline", "camera-outline", "chatbubble-ellipses-outline", "trophy-outline", "ribbon-outline", "color-palette-outline", "rocket-outline", "git-branch-outline", "repeat-outline", "search-outline", "rainy-outline", "umbrella-outline", "chatbubbles-outline", "trail-sign-outline", "book-outline", "pencil-outline", "cafe-outline", "flower-outline", "briefcase-outline", "home-outline", "people-outline", "airplane-outline", "fitness-outline", "musical-notes-outline", "game-controller-outline", "school-outline", "moon-outline", "leaf-outline", "map-outline", "sparkles-outline"];
const METRICS = ['energy','focus','stress','motivation','sleepQuality','physicalWellbeing','activity','appetite','mentalClarity','willpower','anxiety','loneliness','selfConfidence','optimism','selfSatisfaction','lifeSatisfaction'];
const uuid = /^custom:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function invalid(): never { throw new BadRequestException('Invalid check-in settings'); }
function text(v: unknown, max: number): v is string { return typeof v === 'string' && v.trim().length > 0 && v === v.trim() && v.length <= max; }
export function validateCheckinSettings(input: unknown, tracking?: MetricTracking | null): CheckinSettings {
  if (!input || typeof input !== 'object') return invalid();
  const v = input as CheckinSettings;
  if (v.version !== 1 || !Array.isArray(v.templates) || v.templates.length > 116) return invalid();
  const seen = new Set<string>();
  const metricIds = new Set([...METRICS, ...(tracking?.customMetrics ?? []).map(m => m.id)]);
  const templates = v.templates.map(t => {
    if (!t || typeof t !== 'object' || typeof t.id !== 'string' || seen.has(t.id)) return invalid();
    if (t.id === "daily" || t.id === "photoMoment") return invalid();
    const builtin = Object.prototype.hasOwnProperty.call(DEFAULT_QUESTIONS, t.id);
    if (!builtin && !uuid.test(t.id)) return invalid();
    seen.add(t.id);
    if (t.icon !== undefined && (typeof t.icon !== 'string' || (!ICONS.includes(t.icon) && !/^mono:[\p{L}]{1,2}$/u.test(t.icon)))) return invalid();
    if (typeof t.deleted !== 'boolean' || !(t.title === null && builtin || text(t.title, 70)) || !Array.isArray(t.questions) || t.questions.length > 50 || !Array.isArray(t.metricIds) || t.metricIds.length > 116 || new Set(t.metricIds).size !== t.metricIds.length || t.metricIds.some(id => !metricIds.has(id))) return invalid();
    const questions = new Set<string>();
    for (const q of t.questions) {
      if (!q || !text(q.id, 80) || questions.has(q.id) || !(text(q.text, 500) || q.text === null && builtin && DEFAULT_QUESTIONS[t.id].includes(q.id))) return invalid();
      questions.add(q.id);
    }
    return { id: t.id, title: t.title, ...(t.icon === undefined ? {} : { icon: t.icon }), deleted: t.deleted, metricIds: [...t.metricIds], questions: t.questions.map(q => ({ id: q.id, text: q.text })) };
  });
  return { version: 1, templates };
}
