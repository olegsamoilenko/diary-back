import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { DiaryStatisticsService } from './diary-statistics.service';
import { createDiaryStat } from './diary-stat-ai-input';

jest.mock('./diary-stat-ai-input', () => ({ createDiaryStat: jest.fn() }));
jest.mock('../push-notifications/push-notifications.service', () => ({
  PushNotificationsService: class {},
}));

describe('DiaryStatisticsService check-in activity', () => {
  const user = { id: 167 };
  const stat = { createdAt: new Date('2026-10-09T10:00:00Z') };
  const userStatistics = { incrementCheckinStat: jest.fn() };
  const notifications = {
    markDiaryActivityCreated: jest.fn<() => Promise<void>>(),
  };
  let service: DiaryStatisticsService;

  beforeEach(() => {
    jest.resetAllMocks();
    (createDiaryStat as any).mockResolvedValue({ stat, created: true });
    notifications.markDiaryActivityCreated.mockResolvedValue(undefined);
    service = new DiaryStatisticsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        findById: jest.fn<() => Promise<typeof user>>().mockResolvedValue(user),
      } as any,
      {} as any,
      userStatistics as any,
      notifications as any,
    );
  });

  it.each(['daily', 'photo', 'morning'])(
    'records %s check-ins without AI as diary activity',
    async (name) => {
      const data = { aiRequested: false };
      expect(await service.addCheckinStat(user.id, name, data)).toBe(stat);
      expect(createDiaryStat).toHaveBeenCalledWith(
        expect.anything(),
        'checkin',
        user,
        expect.objectContaining(data),
      );
      expect(notifications.markDiaryActivityCreated).toHaveBeenCalledWith({
        userId: user.id,
        activityCreatedAt: stat.createdAt,
      });
    },
  );

  it('does not restart the reminder cycle for a deduplicated check-in', async () => {
    (createDiaryStat as any).mockResolvedValue({ stat, created: false });
    await service.addCheckinStat(user.id, 'morning');
    expect(notifications.markDiaryActivityCreated).not.toHaveBeenCalled();
    expect(userStatistics.incrementCheckinStat).not.toHaveBeenCalled();
  });

  it('keeps a saved check-in when notification bookkeeping fails', async () => {
    notifications.markDiaryActivityCreated.mockRejectedValue(
      new Error('unavailable'),
    );
    await expect(service.addCheckinStat(user.id, 'morning')).resolves.toBe(
      stat,
    );
  });
});
