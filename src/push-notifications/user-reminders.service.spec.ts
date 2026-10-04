import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

jest.mock('expo-server-sdk', () => ({
  Expo: class ExpoMock {},
}));

import { UserRemindersService } from './user-reminders.service';

describe('UserRemindersService', () => {
  it('removes a transferred reminder only for its owner', async () => {
    const repo: any = { delete: jest.fn(async () => undefined) };
    const service = new UserRemindersService(repo, {} as any, {} as any);
    await service.forgetTransferred(7, 'reminder-1');
    expect(repo.delete).toHaveBeenCalledWith({ id: 'reminder-1', userId: 7 });
  });

  it('cleans finished and past pending copies without deleting other owners or future pending reminders', async () => {
    const repo: any = { delete: jest.fn(async () => undefined) };
    const service = new UserRemindersService(repo, {} as any, {} as any);
    await service.forgetFinishedHistory(7);
    const [finished, past] = repo.delete.mock.calls[0][0];
    expect(finished.userId).toBe(7);
    expect(finished.status.value).toEqual(['sent', 'cancelled', 'failed']);
    expect(past.userId).toBe(7);
    expect(past.status).toBe('pending');
    expect(past.scheduledAt.type).toBe('lessThanOrEqual');
    expect(past.scheduledAt.value).toEqual(new Date());
  });
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-08-09T10:00:00.000Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('upserts an extracted reminder idempotently and resets local scheduling when time changes', async () => {
    const existing: any = {
      id: 'reminder-1',
      userId: 7,
      reminderKey: 'entry:entry-1:reminder.test',
      scheduledAt: new Date('2026-08-10T06:00:00.000Z'),
      localNotificationId: 'local-old',
      localScheduledAt: new Date(),
      status: 'pending',
    };
    const repo: any = {
      findOne: jest.fn(async () => existing),
      create: jest.fn((value: any) => value),
      save: jest.fn(async (value: any) => ({ ...value })),
      find: jest.fn(async () => []),
    };
    const service = new UserRemindersService(repo, {} as any, {} as any);

    const result = await service.applyExtraction(7, {
      sourceType: 'entry',
      sourceId: 'entry-1',
      sourceDate: '2026-08-09',
      timezone: 'Europe/Kyiv',
      reminders: [
        {
          reminderKey: 'reminder.test',
          body: 'Test reminder',
          localDate: '2026-08-10',
          localTime: '10:00',
          scheduledAt: '2026-08-10T07:00:00.000Z',
        },
      ],
      updates: [],
    });

    expect(result.reminders).toHaveLength(1);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        reminderKey: 'entry:entry-1:reminder.test',
        localNotificationId: null,
        localScheduledAt: null,
        status: 'pending',
      }),
    );
  });

  it('uses the local notification when confirmed and does not send a duplicate push', async () => {
    const due: any = {
      id: 'reminder-1',
      userId: 7,
      localScheduledAt: new Date(),
      attempts: 0,
    };
    const repo: any = { update: jest.fn(async () => undefined) };
    let queryCount = 0;
    const dataSource: any = {
      transaction: jest.fn(async (callback: any) =>
        callback({
          query: jest.fn(async () => {
            queryCount += 1;
            return queryCount === 1 ? [] : [due];
          }),
        }),
      ),
    };
    const push: any = {
      sendNemoryReminderPushBatch: jest.fn(async () => new Set()),
    };
    const service = new UserRemindersService(repo, dataSource, push);

    await expect(service.processDueReminders()).resolves.toBe(1);
    expect(push.sendNemoryReminderPushBatch).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalledWith(
      'reminder-1',
      expect.objectContaining({ status: 'sent' }),
    );
  });

  it('sends multiple remote fallbacks through one batch call', async () => {
    const due = [
      { id: 'reminder-1', userId: 7, localScheduledAt: null, attempts: 0 },
      { id: 'reminder-2', userId: 8, localScheduledAt: null, attempts: 0 },
    ];
    const repo: any = { update: jest.fn(async () => undefined) };
    let queryCount = 0;
    const dataSource: any = {
      transaction: jest.fn(async (callback: any) =>
        callback({
          query: jest.fn(async () => {
            queryCount += 1;
            return queryCount === 1 ? [] : due;
          }),
        }),
      ),
    };
    const push: any = {
      sendNemoryReminderPushBatch: jest.fn(
        async () => new Set(['reminder-1', 'reminder-2']),
      ),
    };
    const service = new UserRemindersService(repo, dataSource, push);

    await expect(service.processDueReminders()).resolves.toBe(2);
    expect(push.sendNemoryReminderPushBatch).toHaveBeenCalledTimes(1);
    expect(push.sendNemoryReminderPushBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ reminderId: 'reminder-1', userId: 7 }),
        expect.objectContaining({ reminderId: 'reminder-2', userId: 8 }),
      ]),
    );
  });

  it('normalizes the Postgres update tuple when no reminders are due', async () => {
    let queryCount = 0;
    const dataSource: any = {
      transaction: jest.fn(async (callback: any) =>
        callback({
          query: jest.fn(async () => {
            queryCount += 1;
            return queryCount === 1 ? [[], 0] : [[], 0];
          }),
        }),
      ),
    };
    const repo: any = { update: jest.fn() };
    const push: any = { sendNemoryReminderPushBatch: jest.fn() };
    const service = new UserRemindersService(repo, dataSource, push);

    await expect(service.processDueReminders()).resolves.toBe(0);
    expect(repo.update).not.toHaveBeenCalled();
    expect(push.sendNemoryReminderPushBatch).not.toHaveBeenCalled();
  });
});
