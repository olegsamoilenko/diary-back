import { describe, expect, it, jest } from '@jest/globals';
import { logServerMemoryReview } from './entry-flow-debug';

jest.mock('node:fs/promises', () => ({
  appendFile: jest.fn(async () => undefined),
  mkdir: jest.fn(async () => undefined),
}));

describe('logServerMemoryReview', () => {
  it('prints only compact statistics and defers full payload logging', () => {
    jest.useFakeTimers();
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    logServerMemoryReview({
      step: 2,
      title: 'КОНТЕКСТ, ВІДПРАВЛЕНИЙ НА АНАЛІЗ',
      sourceType: 'entry',
      traceId: 'trace-1',
      userId: 1,
      sections: [
        {
          label: 'РЕЛЕВАНТНІ ПОПЕРЕДНІ ЗАПИСИ ТА ЧЕКІНИ',
          value: '[RELEVANT_ENTRY_DIGEST]\n...\n[/RELEVANT_ENTRY_DIGEST]',
          count: 1,
          usage: { tokens: 100, credits: 3 },
        },
      ],
    });
    jest.advanceTimersByTime(1_000);

    expect(log).toHaveBeenCalledTimes(1);
    const stats = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(stats).toMatchObject({
      marker: 'NEMORY_SERVER_REVIEW_STATS',
      step: 2,
      traceId: 'trace-1',
      userId: 1,
    });
    expect(stats.sections).toEqual([
      expect.objectContaining({ count: 1, tokens: 100, credits: 3 }),
    ]);
    expect(String(log.mock.calls[0]?.[0])).not.toContain(
      '[RELEVANT_ENTRY_DIGEST]',
    );

    log.mockRestore();
    jest.clearAllTimers();
    jest.useRealTimers();
  });
});
