import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { LessThan } from 'typeorm';
import { LogsCronService } from './logs.cron.service';

describe('LogsCronService', () => {
  const now = new Date('2026-07-15T12:00:00.000Z');
  const cutoff = new Date('2026-06-15T12:00:00.000Z');
  type DeleteResult = { affected: number };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('deletes application and server HTTP logs older than 30 days', async () => {
    const logRepository = {
      delete: jest
        .fn<() => Promise<DeleteResult>>()
        .mockResolvedValue({ affected: 2 }),
    };
    const serverHttpLogRepository = {
      delete: jest
        .fn<() => Promise<DeleteResult>>()
        .mockResolvedValue({ affected: 3 }),
    };
    const service = new LogsCronService(
      logRepository as never,
      serverHttpLogRepository as never,
    );

    await service.removeOldLogs();

    const expectedCriteria = { createdAt: LessThan(cutoff) };
    expect(logRepository.delete).toHaveBeenCalledWith(expectedCriteria);
    expect(serverHttpLogRepository.delete).toHaveBeenCalledWith(
      expectedCriteria,
    );
  });

  it('still cleans server HTTP logs when application log cleanup fails', async () => {
    const logRepository = {
      delete: jest
        .fn<() => Promise<DeleteResult>>()
        .mockRejectedValue(new Error('application logs failed')),
    };
    const serverHttpLogRepository = {
      delete: jest
        .fn<() => Promise<DeleteResult>>()
        .mockResolvedValue({ affected: 3 }),
    };
    const service = new LogsCronService(
      logRepository as never,
      serverHttpLogRepository as never,
    );

    await service.removeOldLogs();

    expect(serverHttpLogRepository.delete).toHaveBeenCalledWith({
      createdAt: LessThan(cutoff),
    });
  });
});
