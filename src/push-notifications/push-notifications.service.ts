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
import { UserSettings } from 'src/users/entities/user-settings.entity';
import { getNextDiaryIdleReminderDay } from './utils/getNextDiaryIdleReminderDay';
import { getDiaryIdleReminderMessage } from './utils/getDiaryIdleReminderMessage';

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
      console.error('[savePushToken error]', err);
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
        sound: 'default',
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
      } catch (err) {
        console.error('[push] send error', err);
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

  private async sendPushToUsers(params: SendPushToUsersParams) {
    const userIds = [...new Set(params.userIds)].filter(Boolean);

    if (!userIds.length) return;

    const pushTokens = await this.userPushTokenRepo.find({
      where: {
        userId: In(userIds),
        isActive: true,
      },
      select: {
        token: true,
      },
    });

    const tokens = pushTokens.map((item) => item.token);

    await this.sendPushMessages({
      tokens,
      title: params.title,
      body: params.body,
      data: {
        type: params.type,
        ...params.data,
      },
    });
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
        sound: 'default',
        channelId:
          params.data?.type === 'diary_idle_reminder' ? 'diary' : 'forum',
        title: params.title,
        body: params.body,
        data: params.data,
      }));

    if (!messages.length) return;

    const chunks = this.expo.chunkPushNotifications(messages);

    for (const chunk of chunks) {
      try {
        await this.expo.sendPushNotificationsAsync(chunk);
      } catch (err) {
        console.error('[push] send error', err);
      }
    }
  }

  async markDiaryEntryCreated(params: {
    userId: number;
    entryCreatedAt?: Date;
  }) {
    try {
      const entryCreatedAt = params.entryCreatedAt ?? new Date();

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

      existing.idleReminderCount = 0;
      existing.lastIdleReminderSentAt = null;
      existing.lastEntryAtSnapshot = entryCreatedAt;

      return await this.diaryNotificationStateRepo.save(existing);
    } catch (err) {
      console.error('[markDiaryEntryCreated error]', err);
    }
  }

  private getDaysBetween(from: Date, to: Date) {
    return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
  }

  async sendDiaryIdleReminders() {
    const rows = await this.entriesStatRepo
      .createQueryBuilder('stat')
      .select('stat.userId', 'userId')
      .addSelect('MAX(stat.createdAt)', 'lastEntryAt')
      .where('stat.userId IS NOT NULL')
      .groupBy('stat.userId')
      .getRawMany<{ userId: number; lastEntryAt: Date }>();

    const now = new Date();

    for (const row of rows) {
      const userId = Number(row.userId);
      const lastEntryAt = new Date(row.lastEntryAt);

      const state =
        (await this.diaryNotificationStateRepo.findOne({
          where: { userId },
        })) ??
        this.diaryNotificationStateRepo.create({
          userId,
          idleReminderEnabled: true,
          idleReminderCount: 0,
          lastIdleReminderSentAt: null,
          lastEntryAtSnapshot: lastEntryAt,
        });

      if (!state.idleReminderEnabled) {
        continue;
      }

      if (
        state.lastEntryAtSnapshot &&
        lastEntryAt > state.lastEntryAtSnapshot
      ) {
        state.idleReminderCount = 0;
        state.lastIdleReminderSentAt = null;
        state.lastEntryAtSnapshot = lastEntryAt;

        await this.diaryNotificationStateRepo.save(state);
        continue;
      }

      const daysSinceLastEntry = this.getDaysBetween(lastEntryAt, now);

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

      if (daysSinceLastEntry < nextReminderDay) {
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

      const message = getDiaryIdleReminderMessage({
        lang: settings?.lang,
        sentCount: state.idleReminderCount,
      });

      await this.sendPushToUsers({
        userIds: [userId],
        type: 'diary_idle_reminder',
        title: message.title,
        body: message.body,
        data: {
          screen: 'diary',
        },
      });

      state.idleReminderCount += 1;
      state.lastIdleReminderSentAt = now;
      state.lastEntryAtSnapshot = lastEntryAt;

      await this.diaryNotificationStateRepo.save(state);
    }
  }
}
