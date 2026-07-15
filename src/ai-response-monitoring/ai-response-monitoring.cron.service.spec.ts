import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { LessThan } from 'typeorm';
import { AiResponseMonitoringCronService } from './ai-response-monitoring.cron.service';

describe('AiResponseMonitoringCronService', () => {
  const now = new Date('2026-07-15T12:00:00.000Z');
  const cutoff = new Date('2026-07-08T12:00:00.000Z');
  type DeleteResult = { affected: number };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('deletes monitoring records older than 7 days', async () => {
    const monitoringRepository = {
      delete: jest
        .fn<() => Promise<DeleteResult>>()
        .mockResolvedValue({ affected: 4 }),
    };
    const service = new AiResponseMonitoringCronService(
      monitoringRepository as never,
    );

    await service.removeExpiredRecords();

    expect(monitoringRepository.delete).toHaveBeenCalledWith({
      createdAt: LessThan(cutoff),
    });
  });
});
