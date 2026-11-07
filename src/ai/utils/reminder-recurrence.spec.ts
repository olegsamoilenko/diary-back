import { describe, it, expect } from '@jest/globals';
import { normalizeReminderRecurrence } from './reminder-recurrence';
import { buildNemoryCapabilitiesPrompt } from './nemory-capabilities';
import { refreshSavedResponseInstructions } from './response-system-prompt';

describe('reminder recurrence creation contract', () => {
  const base = {
    version: 1,
    frequency: 'daily',
    interval: 1,
    end: { type: 'count', count: 3 },
  };
  it.each(['daily', 'weekly', 'monthly', 'yearly'])(
    'preserves %s interval and bounded series',
    (frequency) => {
      const rule = { ...base, frequency };
      expect(normalizeReminderRecurrence(rule, '2026-11-08')).toEqual(rule);
    },
  );
  it('preserves inclusive end date and weekday selection', () => {
    const rule = {
      ...base,
      frequency: 'daily',
      weekdays: [5, 1, 5],
      end: { type: 'date', dayLocal: '2026-11-30' },
    };
    expect(normalizeReminderRecurrence(rule, '2026-11-08')).toEqual({
      ...rule,
      weekdays: [1, 5],
    });
    expect(
      normalizeReminderRecurrence(
        { version: 1, frequency: 'daily' },
        '2026-11-08',
      ),
    ).toEqual({ ...base, interval: 1, end: { type: 'never' } });
  });
  it.each([
    { interval: 0 },
    { interval: 2 },
    { frequency: 'weekly', weekdays: [1] },
    { interval: 1.5 },
    { interval: 10001 },
    { frequency: 'hourly' },
    { weekdays: [0, 8] },
    { frequency: 'monthly', weekdays: [1] },
    { end: { type: 'date', dayLocal: '2026-11-07' } },
    { end: { type: 'date', dayLocal: '2027-02-30' } },
    { end: { type: 'count', count: 0 } },
    { end: { type: 'count', count: 1.5 } },
    { end: { type: 'count', count: 10001 } },
    { end: { type: 'unknown' } },
  ])('rejects malformed series rather than downgrading it: %j', (patch) => {
    expect(
      normalizeReminderRecurrence({ ...base, ...patch }, '2026-11-08'),
    ).toBeNull();
  });
  it('uses current client support for saved instructions without changing profile data', () => {
    const data = '\n\nREQUEST DATA\nOriginal profile';
    const saved = buildNemoryCapabilitiesPrompt(true, true) + data;
    const oldClient = refreshSavedResponseInstructions(saved, true, false);
    expect(oldClient).toContain('once; repeats manual');
    expect(oldClient).not.toContain('once/repeats');
    expect(oldClient.endsWith(data)).toBe(true);
    const capable = refreshSavedResponseInstructions(oldClient, true, true);
    expect(capable).toContain('once/repeats');
    expect(capable).toContain('Planners:only create on request/acceptance');
    expect(capable).toContain('no replacements;explain inability/manual steps');
  });
});
