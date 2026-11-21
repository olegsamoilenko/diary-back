import { it, expect } from '@jest/globals';
import { normalizePlannerCreationsV2 } from './planner-creation-v2';
import {
  normalizePlannerCreationResult,
  plannerCreationInstructions,
} from './planner-creations';
import { buildNemoryCapabilitiesPrompt } from './nemory-capabilities';
import { refreshSavedResponseInstructions } from './response-system-prompt';

const event = {
  version: 2,
  kind: 'event',
  title: 'Математика',
  startDate: '2026-11-16',
  time: '09:00',
  endTime: '10:30',
  frequency: 'weekly',
  interval: 2,
  recurrenceEnd: { type: 'count', count: 3 },
};
it.each([1, 2, 3, 52])('preserves event week interval %s', (interval) => {
  expect(normalizePlannerCreationsV2([{ ...event, interval }])).toEqual([
    { ...event, interval },
  ]);
});
it.each([0, -1, 1.5, 53, '2', null])(
  'rejects invalid interval %s',
  (interval) => {
    expect(normalizePlannerCreationsV2([{ ...event, interval }])).toEqual([]);
  },
);
it.each(['daily', 'monthly', 'yearly', undefined])(
  'rejects interval for %s',
  (frequency) => {
    expect(normalizePlannerCreationsV2([{ ...event, frequency }])).toEqual([]);
  },
);
it('does not send new interval commands to older V2 clients, including mixed batches', () => {
  const raw = { plannerCreations: [{ ...event, interval: undefined }, event] };
  expect(normalizePlannerCreationResult(raw, 2).plannerCreations).toEqual([]);
  expect(
    normalizePlannerCreationResult(raw, 2, [], undefined, true)
      .plannerCreations,
  ).toHaveLength(2);
  expect(plannerCreationInstructions(2)).toContain('Step=1 only.');
  expect(plannerCreationInstructions(2, true)).toContain(
    'interval?:integer1..52',
  );
  expect(buildNemoryCapabilitiesPrompt(true, true, 'uk', 2)).not.toContain(
    'interval1–52',
  );
  expect(buildNemoryCapabilitiesPrompt(true, true, 'uk', 2, true)).toContain(
    'interval1–52',
  );
});
it('refreshes saved period instructions in both upgrade and downgrade directions', () => {
  const old =
    buildNemoryCapabilitiesPrompt(true, true, 'uk', 2) +
    '\n\nREQUEST DATA\nProfile';
  const upgraded = refreshSavedResponseInstructions(
    old,
    true,
    true,
    'uk',
    2,
    true,
  );
  expect(upgraded).toContain('interval1–52');
  expect(
    refreshSavedResponseInstructions(upgraded, true, true, 'uk', 2, false),
  ).not.toContain('interval1–52');
});
