import { normalizePlannerCreations } from './planner-creations';
import { buildNemoryCapabilitiesPrompt } from './nemory-capabilities';
import { refreshSavedResponseInstructions } from './response-system-prompt';

describe('planner creation boundary', () => {
  it.each([8, 50])('preserves all %i checklist items separately and in source order', (count) => {
    const items = Array.from({ length: count }, (_, i) => `Перевірка ${count - i}`);
    // Repeated labels are separate user items, not candidates for deduplication.
    items[6] = items[1];
    const checklist = { kind: 'checklist', title: 'Перед виходом', items };
    const batch = [checklist, ...Array.from({ length: 5 }, (_, i) => ({ kind: 'task', title: `Завдання ${i}` }))];
    expect(normalizePlannerCreations(batch)).toEqual(batch);
  });
  it('rejects an oversized checklist as a whole rather than saving its first 50 items', () => {
    expect(normalizePlannerCreations([{ kind: 'checklist', title: 'Перевірки', items: Array.from({ length: 51 }, (_, i) => `Пункт ${i}`) }])).toEqual([]);
  });
  it.each(['times', 'minutes'])(
    'preserves an explicit zero upper limit in %s',
    (unit) => {
      const action = {
        kind: 'habit',
        title: 'Без соцмереж',
        frequency: 'daily',
        target: 0,
        unit,
        comparator: 'at_most',
      };
      expect(normalizePlannerCreations([action])).toEqual([action]);
    },
  );
  it.each([
    { target: 0, comparator: 'at_least' },
    { target: 0 },
    { target: -1, comparator: 'at_most' },
    { comparator: 'at_most' },
  ])('rejects invalid or missing habit target %j', (fields) => {
    expect(
      normalizePlannerCreations([
        { kind: 'habit', title: 'Ліміт', frequency: 'daily', ...fields },
      ]),
    ).toEqual([]);
  });

  it.each([
    { kind: 'task', title: 'Попросити дозвіл' },
    {
      kind: 'goal',
      title: 'Портфоліо',
      endDate: '2026-12-06',
      milestones: [
        { title: 'Опис', dueDate: '2026-11-20' },
        { title: 'Приклади', dueDate: '2026-11-30' },
      ],
    },
    {
      kind: 'habit',
      title: 'Читати',
      frequency: 'daily',
      target: 10,
      unit: 'pages',
    },
    { kind: 'event', title: 'Зустріч', startDate: '2026-11-07', time: '09:30' },
    { kind: 'checklist', title: 'Покупки', items: ['Хліб', 'Молоко'] },
    { kind: 'note', title: 'Ідея', description: '<script>Це текст</script>' },
  ])('keeps a valid $kind action', (action) =>
    expect(normalizePlannerCreations([action])).toEqual([action]),
  );
  it.each([
    { kind: 'event', title: 'Зустріч' },
    { kind: 'event', title: 'Зустріч', startDate: '2026-02-30' },
    { kind: 'event', title: 'Зустріч', startDate: '2026-11-07', time: '25:00' },
    { kind: 'habit', title: 'Читати', frequency: 'daily', target: -1 },
    { kind: 'habit', title: 'Читати', frequency: 'monthly', target: 1 },
    { kind: 'checklist', title: 'Покупки', items: [''] },
    { kind: 'note', title: 'Ідея' },
    { kind: 'delete', title: 'Все' },
    {
      kind: 'task',
      title: 'Дія',
      startDate: '2026-11-08',
      endDate: '2026-11-07',
    },
    { kind: 'goal', title: 'Без дедлайну' },
    {
      kind: 'goal',
      title: 'Лише назви',
      endDate: '2026-11-30',
      items: ['Етап'],
    },
    {
      kind: 'goal',
      title: 'Етап без дати',
      endDate: '2026-11-30',
      milestones: [{ title: 'Етап' }],
    },
    {
      kind: 'goal',
      title: 'Етап після цілі',
      endDate: '2026-11-30',
      milestones: [{ title: 'Етап', dueDate: '2026-12-01' }],
    },
    {
      kind: 'goal',
      title: 'Етап до початку',
      startDate: '2026-11-10',
      endDate: '2026-11-30',
      milestones: [{ title: 'Етап', dueDate: '2026-11-09' }],
    },
    {
      kind: 'goal',
      title: 'Неможлива дата',
      endDate: '2026-12-30',
      milestones: [{ title: 'Етап', dueDate: '2026-11-31' }],
    },
  ])('rejects malformed or underspecified $kind', (action) =>
    expect(normalizePlannerCreations([action])).toEqual([]),
  );
  it('never takes entity IDs or completion from model output', () => {
    expect(
      normalizePlannerCreations([
        { kind: 'task', title: 'Дія', id: 'existing', status: 'completed' },
      ]),
    ).toEqual([{ kind: 'task', title: 'Дія' }]);
  });
  it('does not grant a missing client executor or edit/link capability', () => {
    expect(buildNemoryCapabilitiesPrompt()).toContain(
      'never offer/claim automatic creation/modification/linking',
    );
    expect(buildNemoryCapabilitiesPrompt(true)).toContain(
      'invented dates/links',
    );
    expect(buildNemoryCapabilitiesPrompt(true)).toContain(
      'Clarify missing goal/stage dates',
    );
    expect(buildNemoryCapabilitiesPrompt(true)).toContain(
      'no copied deadlines',
    );
  });
  it('does not replace instruction-looking text inside the user profile', () => {
    const data =
      '\n\nREQUEST DATA\nABOUT THE USER\nAPP CAPABILITIES\nMy text\n\nTASK\noriginal';
    const result = refreshSavedResponseInstructions(
      'APP CAPABILITIES\nold' + data,
      true,
    );
    expect(result.endsWith(data)).toBe(true);
    expect(result).toContain('say creating');
  });
  it('downgrades a saved new-client prompt for an older client, preserving source data', () => {
    const data = '\n\nREQUEST DATA\nOriginal user data and task';
    const saved =
      buildNemoryCapabilitiesPrompt(true) +
      data +
      '\nPLANNER EXECUTION\nAuthorized creation\nEND PLANNER EXECUTION';
    const refreshed = refreshSavedResponseInstructions(saved);
    expect(refreshed).toContain(buildNemoryCapabilitiesPrompt(false));
    expect(refreshed).toContain(data);
    expect(refreshed).not.toContain(
      'Request/accepted proposal→create planners',
    );
    expect(refreshed).not.toContain('PLANNER EXECUTION');
  });
});
import { describe, it, expect } from '@jest/globals';
