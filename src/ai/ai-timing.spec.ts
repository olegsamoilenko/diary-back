import { describe, expect, it, jest } from '@jest/globals';
import type { Logger } from '@nestjs/common';
import { markBackendAiTiming } from './ai-timing';

describe('markBackendAiTiming', () => {
  it('collects response timing without printing debug output', () => {
    const logger = { log: jest.fn() } as unknown as Logger;
    const context = {
      traceId: 'trace-1',
      flow: 'create_entry',
      startedAtMs: Date.now(),
      marks: [],
    };

    markBackendAiTiming(logger, context, 'service_started');

    expect(context.marks).toHaveLength(1);
    expect(context.marks[0]).toMatchObject({ phase: 'service_started' });
    expect(logger.log).not.toHaveBeenCalled();
  });
});
