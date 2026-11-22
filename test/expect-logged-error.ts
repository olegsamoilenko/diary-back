import { expect, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';

// Limit interception to the failing operation. Any extra error fails the test.
export async function expectLoggedError(
  expectedArgs: unknown[],
  action: () => PromiseLike<unknown>,
) {
  const log = jest
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => {});
  try {
    await action();
    expect(log.mock.calls).toEqual([expectedArgs]);
  } finally {
    log.mockRestore();
  }
}
