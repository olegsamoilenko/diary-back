import { describe, expect, it, jest } from '@jest/globals';
import { appendFile } from 'node:fs/promises';
import {
  logServerEntryFlow,
  logServerEntryTiming,
  logServerMemoryReview,
} from './entry-flow-debug';

jest.mock('node:fs/promises', () => ({
  appendFile: jest.fn(async () => undefined),
  mkdir: jest.fn(async () => undefined),
}));

describe('logServerMemoryReview', () => {
  it('keeps debug data out of the backend console', async () => {
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
    logServerEntryFlow({
      stage: 1,
      title: 'REQUEST',
      direction: 'APP -> SERVER',
      traceId: 'trace-1',
      userId: 1,
      data: { safe: true },
    });
    logServerEntryTiming({
      event: 'FIRST_AI_REFLECTION_CHUNK',
      traceId: 'trace-1',
      elapsedMs: 100,
    });
    await jest.advanceTimersByTimeAsync(1_010);

    expect(log).not.toHaveBeenCalled();
    const written = jest.mocked(appendFile).mock.calls;
    expect(written).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          expect.stringContaining('nemory-ai-full-'),
          expect.stringContaining('"stage":1'),
          'utf8',
        ]),
        expect.arrayContaining([
          expect.stringContaining('.jsonl'),
          expect.stringContaining('FIRST_AI_REFLECTION_CHUNK'),
          'utf8',
        ]),
      ]),
    );

    log.mockRestore();
    jest.clearAllTimers();
    jest.useRealTimers();
  });
});
