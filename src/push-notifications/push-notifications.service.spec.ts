import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

jest.mock('expo-server-sdk', () => ({
  Expo: class ExpoMock {
    static isExpoPushToken(token: string) {
      return token.startsWith('ExponentPushToken[');
    }

    chunkPushNotifications(messages: unknown[]) {
      return [messages];
    }

    async sendPushNotificationsAsync() {
      return [];
    }
  },
}));

import { PushNotificationsService } from './push-notifications.service';

describe('PushNotificationsService diary idle reminders', () => {
  const userPushTokenRepo = {
    find: jest.fn(),
  };
  const diaryNotificationStateRepo = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };
  const entriesStatQueryBuilder = {
    select: jest.fn(),
    addSelect: jest.fn(),
    where: jest.fn(),
    groupBy: jest.fn(),
    getRawMany: jest.fn(),
  };
  const entriesStatRepo = {
    createQueryBuilder: jest.fn(),
  };
  const checkinsStatQueryBuilder = {
    select: jest.fn(),
    addSelect: jest.fn(),
    where: jest.fn(),
    groupBy: jest.fn(),
    getRawMany: jest.fn(),
  };
  const checkinsStatRepo = { createQueryBuilder: jest.fn() };
  const userSettingsRepo = {
    findOne: jest.fn(),
  };

  let service: PushNotificationsService;

  beforeEach(() => {
    jest.useFakeTimers({
      now: new Date('2026-08-27T00:00:00.000Z'),
    });
    jest.clearAllMocks();

    entriesStatQueryBuilder.select.mockReturnValue(entriesStatQueryBuilder);
    entriesStatQueryBuilder.addSelect.mockReturnValue(entriesStatQueryBuilder);
    entriesStatQueryBuilder.where.mockReturnValue(entriesStatQueryBuilder);
    entriesStatQueryBuilder.groupBy.mockReturnValue(entriesStatQueryBuilder);
    entriesStatRepo.createQueryBuilder.mockReturnValue(entriesStatQueryBuilder);
    checkinsStatQueryBuilder.select.mockReturnValue(checkinsStatQueryBuilder);
    checkinsStatQueryBuilder.addSelect.mockReturnValue(
      checkinsStatQueryBuilder,
    );
    checkinsStatQueryBuilder.where.mockReturnValue(checkinsStatQueryBuilder);
    checkinsStatQueryBuilder.groupBy.mockReturnValue(checkinsStatQueryBuilder);
    checkinsStatRepo.createQueryBuilder.mockReturnValue(
      checkinsStatQueryBuilder,
    );
    (entriesStatQueryBuilder.getRawMany as any).mockResolvedValue([]);
    (checkinsStatQueryBuilder.getRawMany as any).mockResolvedValue([]);

    service = new PushNotificationsService(
      userPushTokenRepo as any,
      diaryNotificationStateRepo as any,
      entriesStatRepo as any,
      userSettingsRepo as any,
      checkinsStatRepo as any,
    );
  });

  it.each(['diary_idle_reminder', 'nemory_reminder', 'forum_new_comment'])(
    'adds the shared Open category only to reminders: %s',
    async (type) => {
      const send = jest.spyOn(
        (service as any).expo,
        'sendPushNotificationsAsync',
      );
      await (service as any).sendPushMessages({
        tokens: ['ExponentPushToken[app]'],
        title: 'Title',
        body: 'Body',
        data: { type },
      });
      const message = (send.mock.calls[0][0] as any[])[0];
      if (type === 'forum_new_comment')
        expect(message).not.toHaveProperty('categoryId');
      else expect(message.categoryId).toBe('nemory-reminder-open-v1');
      expect(message.data.type).toBe(type);
      expect(message.sound).toBe(
        type === 'forum_new_comment' ? 'nemory_community.wav' : 'nemory_knock.wav',
      );
    },
  );

  function arrangeDueReminder(params?: {
    pushNotificationsEnabled?: boolean;
    idleReminderCount?: number;
  }) {
    const lastEntryAt = new Date('2026-08-20T00:00:00.000Z');
    const state = {
      userId: 167,
      idleReminderEnabled: true,
      idleReminderCount: params?.idleReminderCount ?? 0,
      lastIdleReminderSentAt: null,
      lastEntryAtSnapshot: lastEntryAt,
    };

    (entriesStatQueryBuilder.getRawMany as any).mockResolvedValue([
      { userId: 167, lastActivityAt: lastEntryAt },
    ]);
    (diaryNotificationStateRepo.findOne as any).mockResolvedValue(state);
    (userSettingsRepo.findOne as any).mockResolvedValue({
      lang: 'uk',
      pushNotificationsEnabled: params?.pushNotificationsEnabled ?? true,
    });
    return state;
  }

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('resets an existing reminder cycle from a historical check-in without sending', async () => {
    const state = arrangeDueReminder({ idleReminderCount: 3 });
    const checkinAt = new Date('2026-08-26T12:00:00Z');
    (checkinsStatQueryBuilder.getRawMany as any).mockResolvedValue([
      { userId: 167, lastActivityAt: checkinAt },
    ]);
    const send = jest.spyOn(service as any, 'sendPushToUsers');
    await service.sendDiaryIdleReminders();
    expect(send).not.toHaveBeenCalled();
    expect(state).toMatchObject({
      idleReminderCount: 0,
      lastIdleReminderSentAt: null,
      lastEntryAtSnapshot: checkinAt,
    });
  });

  it('uses a newer entry instead of an older check-in', async () => {
    const state = arrangeDueReminder();
    const entryAt = new Date('2026-08-26T12:00:00Z');
    (entriesStatQueryBuilder.getRawMany as any).mockResolvedValue([
      { userId: 167, lastActivityAt: entryAt },
    ]);
    (checkinsStatQueryBuilder.getRawMany as any).mockResolvedValue([
      { userId: 167, lastActivityAt: new Date('2026-08-01T00:00:00Z') },
    ]);
    const send = jest.spyOn(service as any, 'sendPushToUsers');
    await service.sendDiaryIdleReminders();
    expect(send).not.toHaveBeenCalled();
    expect(state.lastEntryAtSnapshot).toEqual(entryAt);
  });

  it.each([
    ['2026-08-26T00:00:00Z', false],
    ['2026-08-24T00:00:00Z', true],
  ])(
    'applies the three-day threshold to check-in-only users: %s',
    async (date, due) => {
      (diaryNotificationStateRepo.findOne as any).mockResolvedValue(null);
      (userSettingsRepo.findOne as any).mockResolvedValue({
        lang: 'uk',
        pushNotificationsEnabled: true,
      });
      (checkinsStatQueryBuilder.getRawMany as any).mockResolvedValue([
        { userId: 168, lastActivityAt: new Date(date) },
      ]);
      const send = jest
        .spyOn(service as any, 'sendPushToUsers')
        .mockResolvedValue(true);
      await service.sendDiaryIdleReminders();
      expect(send).toHaveBeenCalledTimes(due ? 1 : 0);
      if (due)
        expect(send).toHaveBeenCalledWith(
          expect.objectContaining({ userIds: [168] }),
        );
    },
  );

  it('does not use another user’s recent check-in to suppress a due reminder', async () => {
    const state = arrangeDueReminder();
    (diaryNotificationStateRepo.findOne as any).mockImplementation(
      async ({ where }) => (where.userId === 167 ? state : null),
    );
    (checkinsStatQueryBuilder.getRawMany as any).mockResolvedValue([
      { userId: 168, lastActivityAt: new Date('2026-08-26T00:00:00Z') },
    ]);
    const send = jest
      .spyOn(service as any, 'sendPushToUsers')
      .mockResolvedValue(true);
    await service.sendDiaryIdleReminders();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ userIds: [167] }),
    );
  });

  it('resets activity without re-enabling disabled reminders', async () => {
    const state = arrangeDueReminder({ idleReminderCount: 2 });
    state.idleReminderEnabled = false;
    const activityCreatedAt = new Date('2026-08-26T00:00:00Z');
    await service.markDiaryActivityCreated({ userId: 167, activityCreatedAt });
    expect(state).toMatchObject({
      idleReminderEnabled: false,
      idleReminderCount: 0,
      lastEntryAtSnapshot: activityCreatedAt,
    });
    const send = jest.spyOn(service as any, 'sendPushToUsers');
    await service.sendDiaryIdleReminders();
    expect(send).not.toHaveBeenCalled();
  });

  it('keeps the entry adapter and ignores delayed older activity', async () => {
    const state = arrangeDueReminder();
    const entryCreatedAt = new Date('2026-08-26T00:00:00Z');
    await service.markDiaryEntryCreated({ userId: 167, entryCreatedAt });
    await service.markDiaryActivityCreated({
      userId: 167,
      activityCreatedAt: new Date('2026-08-21T00:00:00Z'),
    });
    expect(state.lastEntryAtSnapshot).toEqual(entryCreatedAt);
    expect(diaryNotificationStateRepo.save).toHaveBeenCalledTimes(1);
  });

  it('keeps Community pushes as OS-visible notification messages', async () => {
    const sendPushNotificationsAsync = jest
      .spyOn((service as any).expo, 'sendPushNotificationsAsync')
      .mockResolvedValue([]);

    await service.sendForumNewCommentPush({
      tokens: ['ExponentPushToken[android]'],
      topicId: 'topic-1',
      commentId: 'comment-1',
      title: 'New comment',
      body: 'Comment body',
    });

    expect(sendPushNotificationsAsync).toHaveBeenCalledWith([
      {
        to: 'ExponentPushToken[android]',
        sound: 'nemory_community.wav',
        channelId: 'forum',
        title: 'New comment',
        body: 'Comment body',
        data: {
          type: 'forum_new_comment',
          topicId: 'topic-1',
          commentId: 'comment-1',
        },
      },
    ]);
  });

  it('does not send when app push notifications are disabled', async () => {
    arrangeDueReminder({ pushNotificationsEnabled: false });
    const sendPushToUsers = jest
      .spyOn(service as any, 'sendPushToUsers')
      .mockResolvedValue(true);

    await service.sendDiaryIdleReminders();

    expect(sendPushToUsers).not.toHaveBeenCalled();
    expect(diaryNotificationStateRepo.save).not.toHaveBeenCalled();
  });

  it('does not advance reminder state when Expo accepts no delivery', async () => {
    const state = arrangeDueReminder();
    jest.spyOn(service as any, 'sendPushToUsers').mockResolvedValue(false);

    await service.sendDiaryIdleReminders();

    expect(state.idleReminderCount).toBe(0);
    expect(state.lastIdleReminderSentAt).toBeNull();
    expect(diaryNotificationStateRepo.save).not.toHaveBeenCalled();
  });

  it('advances state only after an accepted app-scoped delivery', async () => {
    const state = arrangeDueReminder();
    const sendPushToUsers = jest
      .spyOn(service as any, 'sendPushToUsers')
      .mockResolvedValue(true);

    await service.sendDiaryIdleReminders();

    expect(sendPushToUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'diary_idle_reminder',
        tokenScopes: ['app'],
      }),
    );
    expect(state.idleReminderCount).toBe(1);
    expect(state.lastIdleReminderSentAt).toEqual(
      new Date('2026-08-27T00:00:00.000Z'),
    );
    expect(diaryNotificationStateRepo.save).toHaveBeenCalledWith(state);
  });

  it('filters out tokens outside the requested scope', async () => {
    (userPushTokenRepo.find as any).mockResolvedValue([
      { token: 'ExponentPushToken[app]', scope: 'app' },
      { token: 'ExponentPushToken[forum]', scope: 'forum' },
      { token: 'ExponentPushToken[legacy]', scope: null },
    ]);
    const sendPushMessages = jest
      .spyOn(service as any, 'sendPushMessages')
      .mockResolvedValue(1);

    const accepted = await (service as any).sendPushToUsers({
      userIds: [167],
      type: 'diary_idle_reminder',
      title: 'Title',
      body: 'Body',
      tokenScopes: ['app'],
    });

    expect(sendPushMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: ['ExponentPushToken[app]'],
      }),
    );
    expect(accepted).toBe(true);
  });
});
