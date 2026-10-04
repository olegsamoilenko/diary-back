import { readSavedSourceMessage } from './saved-source-message';
import { expect, it } from '@jest/globals';

const snapshot = (overrides = {}) =>
  JSON.stringify({
    protocol: 'memory_capsules_v2',
    entryResponseContext: {
      version: 1,
      sourceCreatedAt: 100,
      sourceMessage: {
        role: 'user',
        content: ' Exact source\r\nMood: calm\nMetrics: energy=3  ',
      },
      ...overrides,
    },
  });

it('preserves all source bytes for entries and check-ins', () => {
  expect(readSavedSourceMessage(snapshot(), 'entry', 100)).toBe(
    ' Exact source\r\nMood: calm\nMetrics: energy=3  ',
  );
  expect(
    readSavedSourceMessage(snapshot({ sourceType: 'checkin' }), 'checkin', 100),
  ).toBe(readSavedSourceMessage(snapshot(), 'entry', 100));
});
it('leaves legacy, invalid, mismatched and non-user payloads to the existing renderer', () => {
  for (const json of [
    undefined,
    '{',
    '{}',
    'null',
    snapshot({ version: 2 }),
    snapshot({ sourceType: 'checkin' }),
    snapshot({ sourceCreatedAt: 200 }),
    snapshot({ sourceMessage: { role: 'system', content: 'wrong role' } }),
  ]) {
    expect(readSavedSourceMessage(json, 'entry', 100)).toBeUndefined();
  }
});
