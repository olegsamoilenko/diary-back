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

    service = new PushNotificationsService(
      userPushTokenRepo as any,
      diaryNotificationStateRepo as any,
      entriesStatRepo as any,
      userSettingsRepo as any,
    );
  });

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
      { userId: 167, lastEntryAt },
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
        sound: 'default',
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
