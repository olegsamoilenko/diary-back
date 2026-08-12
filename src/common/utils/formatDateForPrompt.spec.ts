import { describe, expect, it } from '@jest/globals';

import {
  formatDateForPrompt,
  formatWeekdayForPrompt,
} from './formatDateForPrompt';

describe('formatDateForPrompt', () => {
  it('formats itemDateMs in the request timezone instead of the server timezone', () => {
    const timestamp = Date.UTC(2026, 7, 10, 21, 30);

    expect(formatDateForPrompt(timestamp, 'Europe/Kyiv')).toBe(
      '2026-08-11 00:30',
    );
    expect(formatDateForPrompt(timestamp, 'America/New_York')).toBe(
      '2026-08-10 17:30',
    );
  });

  it('formats the saved weekday in the same request timezone', () => {
    const timestamp = Date.UTC(2026, 6, 12, 21, 30);

    expect(formatWeekdayForPrompt(timestamp, 'Europe/Kyiv')).toBe('Monday');
    expect(formatWeekdayForPrompt(timestamp, 'America/New_York')).toBe(
      'Sunday',
    );
  });
});
