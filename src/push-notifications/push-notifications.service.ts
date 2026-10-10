import { Injectable } from '@nestjs/common';
import { SavePushTokenDto } from './dto/save-push-token.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { UserPushToken } from './entities/user-push-token.entity';
import { Expo } from 'expo-server-sdk';
import {
  ForumCommentModerationPushParams,
  ForumTopicModerationPushParams,
  ForumUserRestrictionPushParams,
} from './types/moderation';
import { SendPushToUsersParams } from './types/push';
import { HttpStatus } from 'src/common/utils/http-status';
import { throwError } from 'src/common/utils';
import { DiaryNotificationState } from './entities/diary-notification-state';
import { EntriesStat } from 'src/diary-statistics/entities/entries-stat.entity';
import { CheckinsStat } from 'src/diary-statistics/entities/checkins-stat.entity';
import { UserSettings } from 'src/users/entities/user-settings.entity';
import { getNextDiaryIdleReminderDay } from './utils/getNextDiaryIdleReminderDay';
import { getDiaryIdleReminderMessage } from './utils/getDiaryIdleReminderMessage';
import { REMINDER_SOUND } from './constants/reminder-sound';
import { COMMUNITY_SOUND } from './constants/community-sound';

type NemoryReminderPushParams = {
  userId: number;
  reminderId: string;
  title: string;
  body: string;
  sourceType: string;
  sourceId: string;
  sourceDate: string | null;
  sourceEntryKind: string | null;
};

@Injectable()
export class PushNotificationsService {
  private expo = new Expo();

  constructor(
    @InjectRepository(UserPushToken)
    private readonly userPushTokenRepo: Repository<UserPushToken>,

    @InjectRepository(DiaryNotificationState)
    private readonly diaryNotificationStateRepo: Repository<DiaryNotificationState>,

    @InjectRepository(EntriesStat)
    private readonly entriesStatRepo: Repository<EntriesStat>,

    @InjectRepository(UserSettings)
    private readonly userSettingsRepo: Repository<UserSettings>,

    @InjectRepository(CheckinsStat)
    private readonly checkinsStatRepo: Repository<CheckinsStat>,
  ) {}

  async savePushToken(userId: number, dto: SavePushTokenDto) {
    try {
      const token = dto.token?.trim();

      if (!token) {
        throwError(
          HttpStatus.BAD_REQUEST,
          'Push token is empty',
          'Push token is empty',
          'PUSH_TOKEN_IS_EMPTY',
        );
      }

      const existing = await this.userPushTokenRepo.findOne({
        where: {
          userId,
          token,
        },
      });

      if (existing) {
        existing.isActive = true;
        existing.platform = dto.platform;
        existing.scope = dto.scope ?? existing.scope ?? null;
        existing.locale = dto.locale ?? existing.locale ?? null;

        await this.userPushTokenRepo.save(existing);

        return { success: true };
      }

      await this.userPushTokenRepo.save(
        this.userPushTokenRepo.create({
          userId,
          token,
          platform: dto.platform,
          scope: dto.scope ?? null,
          locale: dto.locale ?? null,
          isActive: true,
        }),
      );

      return { success: true };
    } catch (err) {
      throw err;
    }
  }

  async sendForumNewCommentPush(params: {
    tokens: string[];
    topicId: string;
    commentId: string;
    title: string;
    body: string;
  }) {
    const messages = params.tokens
      .filter((token) => Expo.isExpoPushToken(token))
      .map((token) => ({
        to: token,
        sound: COMMUNITY_SOUND,
        channelId: 'forum',
        title: params.title,
        body: params.body,
        data: {
          type: 'forum_new_comment',
          topicId: params.topicId,
          commentId: params.commentId,
        },
      }));

    if (!messages.length) return;

    const chunks = this.expo.chunkPushNotifications(messages);

    for (const chunk of chunks) {
      try {
        const tickets = await this.expo.sendPushNotificationsAsync(chunk);
      } catch {
        // Continue delivering the remaining chunks after a failed batch.
      }
    }
  }

  async sendForumTopicRemovedByModeratorPush(
    params: ForumTopicModerationPushParams,
  ) {
    await this.sendPushToUsers({
      userIds: [params.userId],
      type: 'forum_topic_removed_by_moderator',
      title: params.title,
      body: params.body,
      data: {
        topicId: params.topicId,
      },
    });
  }

  async sendForumTopicRestoredByModeratorPush(
    params: ForumTopicModerationPushParams,
  ) {
    await this.sendPushToUsers({
      userIds: [params.userId],
      type: 'forum_topic_restored_by_moderator',
      title: params.title,
      body: params.body,
      data: {
        topicId: params.topicId,
      },
    });
  }

  async sendForumCommentRemovedByModeratorPush(
    params: ForumCommentModerationPushParams,
  ) {
    await this.sendPushToUsers({
      userIds: [params.userId],
      type: 'forum_comment_removed_by_moderator',
      title: params.title,
      body: params.body,
      data: {
        commentId: params.commentId,
      },
    });
  }

  async sendForumCommentRestoredByModeratorPush(
    params: ForumCommentModerationPushParams,
  ) {
    await this.sendPushToUsers({
      userIds: [params.userId],
      type: 'forum_comment_restored_by_moderator',
      title: params.title,
      body: params.body,
      data: {
        commentId: params.commentId,
      },
    });
  }

  async sendForumUserRestrictedPush(params: ForumUserRestrictionPushParams) {
    await this.sendPushToUsers({
      userIds: [params.userId],
      type: 'forum_user_restricted',
      title: params.title,
      body: params.body,
      data: {
        restrictionId: params.restrictionId,
        restrictedUntil: params.restrictedUntil ?? null,
      },
    });
  }

  async sendForumUserUnrestrictedPush(params: ForumUserRestrictionPushParams) {
    await this.sendPushToUsers({
      userIds: [params.userId],
      type: 'forum_user_unrestricted',
      title: params.title,
      body: params.body,
      data: {
        restrictionId: params.restrictionId,
      },
    });
  }

  async sendNemoryReminderPush(params: NemoryReminderPushParams) {
    const acceptedReminderIds = await this.sendNemoryReminderPushBatch([
      params,
    ]);
    return acceptedReminderIds.has(params.reminderId);
  }

  async sendNemoryReminderPushBatch(params: NemoryReminderPushParams[]) {
    const acceptedReminderIds = new Set<string>();
    const userIds = [...new Set(params.map((item) => item.userId))];
    if (!userIds.length) return acceptedReminderIds;

    const pushTokens = await this.userPushTokenRepo.find({
      where: {
        userId: In(userIds),
        isActive: true,
      },
      select: {
        userId: true,
        token: true,
      },
    });

    const tokensByUserId = new Map<number, string[]>();
    for (const pushToken of pushTokens) {
      if (!Expo.isExpoPushToken(pushToken.token)) continue;
      const userTokens = tokensByUserId.get(pushToken.userId) ?? [];
      userTokens.push(pushToken.token);
      tokensByUserId.set(pushToken.userId, userTokens);
    }

    const deliveries = params.flatMap((reminder) =>
      (tokensByUserId.get(reminder.userId) ?? []).map((token) => ({
        reminderId: reminder.reminderId,
        message: {
          to: token,
          sound: REMINDER_SOUND,
          channelId: 'nemory-reminders',
          categoryId: 'nemory-reminder-open-v1',
          title: reminder.title,
          body: reminder.body,
          data: {
            type: 'nemory_reminder',
            reminderId: reminder.reminderId,
            sourceType: reminder.sourceType,
            sourceId: reminder.sourceId,
            sourceDate: reminder.sourceDate,
            sourceEntryKind: reminder.sourceEntryKind,
          },
        },
      })),
    );

    for (let offset = 0; offset < deliveries.length; offset += 100) {
      const chunk = deliveries.slice(offset, offset + 100);
      try {
        const tickets = await this.expo.sendPushNotificationsAsync(
          chunk.map((delivery) => delivery.message),
        );
        tickets.forEach((ticket, index) => {
          if (ticket.status === 'ok') {
            acceptedReminderIds.add(chunk[index].reminderId);
          }
        });
      } catch {
        // Preserve retry eligibility and continue with the remaining batches.
      }
    }

    return acceptedReminderIds;
  }

  private async sendPushToUsers(params: SendPushToUsersParams) {
    const userIds = [...new Set(params.userIds)].filter(Boolean);

    if (!userIds.length) return false;

    const pushTokens = await this.userPushTokenRepo.find({
      where: {
        userId: In(userIds),
        isActive: true,
      },
      select: {
        token: true,
        scope: true,
      },
    });

    const tokens = pushTokens
      .filter(
        (item) =>
          !params.tokenScopes ||
          (item.scope != null && params.tokenScopes.includes(item.scope)),
      )
      .map((item) => item.token);

    const accepted = await this.sendPushMessages({
      tokens,
      title: params.title,
      body: params.body,
      data: {
        type: params.type,
        ...params.data,
      },
    });
    return accepted > 0;
  }

  private async sendPushMessages(params: {
    tokens: string[];
    title: string;
    body: string;
    data: Record<string, unknown>;
  }) {
    const messages = params.tokens
      .filter((token) => Expo.isExpoPushToken(token))
      .map((token) => ({
        to: token,
        sound:
          params.data?.type === 'nemory_reminder' ||
          params.data?.type === 'diary_idle_reminder'
            ? REMINDER_SOUND
            : COMMUNITY_SOUND,
        channelId:
          params.data?.type === 'nemory_reminder'
            ? 'nemory-reminders'
            : params.data?.type === 'diary_idle_reminder'
              ? 'diary'
              : 'forum',
        title: params.title,
        ...(params.data?.type === 'nemory_reminder' ||
        params.data?.type === 'diary_idle_reminder'
          ? { categoryId: 'nemory-reminder-open-v1' }
          : {}),
        body: params.body,
        data: params.data,
      }));

    if (!messages.length) return 0;

    const chunks = this.expo.chunkPushNotifications(messages);

    let accepted = 0;
    for (const chunk of chunks) {
      try {
        const tickets = await this.expo.sendPushNotificationsAsync(chunk);
        accepted += tickets.filter((ticket) => ticket.status === 'ok').length;
      } catch {
        // A failed chunk contributes no accepted tickets.
      }
    }
    return accepted;
  }

  async markDiaryEntryCreated(params: {
    userId: number;
    entryCreatedAt?: Date;
  }) {
    return this.markDiaryActivityCreated({
      userId: params.userId,
      activityCreatedAt: params.entryCreatedAt,
    });
  }

  async markDiaryActivityCreated(params: {
    userId: number;
    activityCreatedAt?: Date;
  }) {
    try {
      const entryCreatedAt = params.activityCreatedAt ?? new Date();

      const existing = await this.diaryNotificationStateRepo.findOne({
        where: {
          userId: params.userId,
        },
      });

      if (!existing) {
        return await this.diaryNotificationStateRepo.save(
          this.diaryNotificationStateRepo.create({
            userId: params.userId,
            idleReminderEnabled: true,
            idleReminderCount: 0,
            lastIdleReminderSentAt: null,
            lastEntryAtSnapshot: entryCreatedAt,
          }),
        );
      }

      if (
        existing.lastEntryAtSnapshot &&
        existing.lastEntryAtSnapshot >= entryCreatedAt
      ) {
        return existing;
      }

      existing.idleReminderCount = 0;
      existing.lastIdleReminderSentAt = null;
      existing.lastEntryAtSnapshot = entryCreatedAt;

      return await this.diaryNotificationStateRepo.save(existing);
    } catch {
      // Notification bookkeeping must not prevent diary creation.
    }
  }

  private getDaysBetween(from: Date, to: Date) {
    return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
  }

  async sendDiaryIdleReminders() {
    // Read both persisted sources so existing check-ins and check-in-only users
    // participate without a backfill or a second notification state.
    const activityGroups = await Promise.all(
      [this.entriesStatRepo, this.checkinsStatRepo].map((repository) =>
        repository
          .createQueryBuilder('stat')
          .select('stat.userId', 'userId')
          .addSelect('MAX(stat.createdAt)', 'lastActivityAt')
          .where('stat.userId IS NOT NULL')
          .groupBy('stat.userId')
          .getRawMany<{ userId: number; lastActivityAt: Date }>(),
      ),
    );
    const latestActivityByUser = new Map<number, Date>();
    for (const rows of activityGroups) {
      for (const row of rows) {
        const userId = Number(row.userId);
        const activityAt = new Date(row.lastActivityAt);
        const previous = latestActivityByUser.get(userId);
        if (!previous || activityAt > previous) {
          latestActivityByUser.set(userId, activityAt);
        }
      }
    }

    const now = new Date();

    for (const [userId, lastActivityAt] of latestActivityByUser) {
      const state =
        (await this.diaryNotificationStateRepo.findOne({
          where: { userId },
        })) ??
        this.diaryNotificationStateRepo.create({
          userId,
          idleReminderEnabled: true,
          idleReminderCount: 0,
          lastIdleReminderSentAt: null,
          lastEntryAtSnapshot: lastActivityAt,
        });

      if (!state.idleReminderEnabled) {
        continue;
      }

      if (
        state.lastEntryAtSnapshot &&
        lastActivityAt > state.lastEntryAtSnapshot
      ) {
        state.idleReminderCount = 0;
        state.lastIdleReminderSentAt = null;
        state.lastEntryAtSnapshot = lastActivityAt;

        await this.diaryNotificationStateRepo.save(state);
        continue;
      }

      const daysSinceLastActivity = this.getDaysBetween(lastActivityAt, now);

      const nextReminderDay = getNextDiaryIdleReminderDay(
        state.idleReminderCount,
      );

      if (state.lastIdleReminderSentAt) {
        const daysSinceLastReminder = this.getDaysBetween(
          state.lastIdleReminderSentAt,
          now,
        );

        if (daysSinceLastReminder < 1) {
          await this.diaryNotificationStateRepo.save(state);
          continue;
        }
      }

      if (daysSinceLastActivity < nextReminderDay) {
        await this.diaryNotificationStateRepo.save(state);
        continue;
      }

      const settings = await this.userSettingsRepo.findOne({
        where: {
          user: {
            id: userId,
          },
        },
        relations: {
          user: true,
        },
      });

      if (settings?.pushNotificationsEnabled !== true) {
        continue;
      }

      const message = getDiaryIdleReminderMessage({
        lang: settings?.lang,
        sentCount: state.idleReminderCount,
      });

      const accepted = await this.sendPushToUsers({
        userIds: [userId],
        type: 'diary_idle_reminder',
        title: message.title,
        body: message.body,
        tokenScopes: ['app'],
        data: {
          screen: 'diary',
        },
      });

      if (!accepted) {
        continue;
      }

      state.idleReminderCount += 1;
      state.lastIdleReminderSentAt = now;
      state.lastEntryAtSnapshot = lastActivityAt;

      await this.diaryNotificationStateRepo.save(state);
    }
  }
}
