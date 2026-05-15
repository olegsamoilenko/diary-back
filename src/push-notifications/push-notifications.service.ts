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
  SendPushToUsersParams,
} from './types/moderation';
import { HttpStatus } from 'src/common/utils/http-status';
import { throwError } from 'src/common/utils';

@Injectable()
export class PushNotificationsService {
  private expo = new Expo();

  constructor(
    @InjectRepository(UserPushToken)
    private readonly userPushTokenRepo: Repository<UserPushToken>,
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
        channelId: 'forum',
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
}
