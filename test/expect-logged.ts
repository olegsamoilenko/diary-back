import { expect, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';

// Capture only this operation. Missing or extra calls fail the assertion.
async function expectLogCalls(
  level: 'error' | 'warn',
  expectedCalls: unknown[][],
  action: () => PromiseLike<unknown>,
) {
  const log = jest.spyOn(Logger.prototype, level).mockImplementation(() => {});
  try {
    await action();
    expect(log.mock.calls).toEqual(expectedCalls);
  } finally {
    log.mockRestore();
  }
}

export function expectLoggedError(
  expectedArgs: unknown[],
  action: () => PromiseLike<unknown>,
) {
  return expectLogCalls('error', [expectedArgs], action);
}

export function expectLoggedWarnings(
  messages: string[],
  action: () => PromiseLike<unknown>,
) {
  return expectLogCalls(
    'warn',
    messages.map((message) => [message]),
    action,
  );
}
