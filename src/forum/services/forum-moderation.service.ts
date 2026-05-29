import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ForumTopicModerationRemoveDto } from '../dto/admin/forum-topic-moderation-remove.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { ForumTopic } from '../entities/forum-topic.entity';
import { IsNull, Repository } from 'typeorm';
import { ForumModerationLogsService } from './forum-moderation-logs.service';
import { ForumContentStatus } from '../types/forum-content-status.enum';
import { ForumModerationAction } from '../types/forum-moderation-action.enum';
import { ForumModerationTargetType } from '../types/forum-moderation-target-type.enum';
import { ForumTopicModerationRestoreDto } from '../dto/admin/forum-topic-moderation-restore.dto';
import { ForumComment } from '../entities/forum-comment.entity';
import { ForumPublicProfile } from '../entities/forum-public-profile.entity';
import { PushNotificationsService } from 'src/push-notifications/push-notifications.service';
import { getForumRemoveTopicPushText } from '../../push-notifications/utils/getForumRemoveTopicPushText';
import { getForumRestoreTopicPushText } from '../../push-notifications/utils/getForumRestoreTopicPushText';
import { getForumRemoveCommentPushText } from '../../push-notifications/utils/getForumRemoveCommentPushText';
import { getForumRestoreCommentPushText } from '../../push-notifications/utils/getForumRestoreCommentPushText';
import { throwError } from '../../common/utils';
import { HttpStatus } from '../../common/utils/http-status';

@Injectable()
export class ForumModerationService {
  constructor(
    @InjectRepository(ForumTopic)
    private readonly topicsRepo: Repository<ForumTopic>,

    @InjectRepository(ForumComment)
    private readonly commentsRepo: Repository<ForumComment>,

    private readonly moderationLogsService: ForumModerationLogsService,

    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  async removeTopic(topicId: string, dto: ForumTopicModerationRemoveDto) {
    const topic = await this.topicsRepo.findOne({
      where: {
        id: topicId,
        deletedAt: IsNull(),
      },
      relations: {
        author: {
          settings: true,
        },
      },
    });

    if (!topic) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Topic not found',
        'Topic not found',
        'TOPIC_NOT_FOUND',
      );
    }

    if (topic.status === ForumContentStatus.REMOVED_BY_MODERATOR) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Topic already removed by moderator',
        'Topic already removed by moderator',
        'TOPIC_ALREADY_REMOVED_BY_MODERATOR',
      );
    }

    if (topic.status === ForumContentStatus.REMOVED_BY_AUTHOR) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Author-removed topic cannot be removed by moderator',
        'Author-removed topic cannot be removed by moderator',
        'AUTHOR_REMOVED_TOPIC_CANNOT_BE_REMOVED_BY_MODERATOR',
      );
    }

    await this.topicsRepo.update(topic.id, {
      status: ForumContentStatus.REMOVED_BY_MODERATOR,
      moderationRemovedAt: new Date(),
      moderationRemovedByAdminId: dto.moderationRemovedByAdminId,
      moderationRemoveReason: dto.moderationRemoveReason,
      moderationRemoveNote: dto.moderationRemoveNote?.trim() || null,
    });

    if (dto.targetUserId !== topic.authorId) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Target user does not match topic author',
        'Target user does not match topic author',
        'TARGET_USER_DOES_NOT_MATCH_TOPIC_AUTHOR',
      );
    }

    await this.moderationLogsService.create({
      moderatorId: dto.moderationRemovedByAdminId,
      targetUserId: topic.authorId,
      action: ForumModerationAction.REMOVE_TOPIC,
      targetType: ForumModerationTargetType.TOPIC,
      targetId: topic.id,
      reason: dto.moderationRemoveReason,
      note: dto.moderationRemoveNote,
      metadataJson: {
        topicId: topic.id,
        authorId: topic.authorId,
        previousStatus: topic.status,
        note: dto.moderationRemoveNote?.trim() || null,
      },
    });

    const authorLang = topic.author?.settings?.lang ?? 'en';

    const text = getForumRemoveTopicPushText({
      locale: authorLang,
      topicTitle: topic.title,
      note: dto.moderationRemoveNote,
    });

    await this.pushNotificationsService.sendForumTopicRemovedByModeratorPush({
      topicId: topic.id,
      userId: topic.authorId,
      title: text.title,
      body: text.body,
    });

    const updatedTopic = await this.topicsRepo.findOne({
      where: {
        id: topic.id,
      },
      relations: {
        category: true,
        author: true,
      },
    });

    if (!updatedTopic) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Updated topic not found',
        'Updated topic not found',
        'UPDATED_TOPIC_NOT_FOUND',
      );
    }

    return updatedTopic;
  }

  async restoreTopic(topicId: string, dto: ForumTopicModerationRestoreDto) {
    const topic = await this.topicsRepo.findOne({
      where: {
        id: topicId,
        deletedAt: IsNull(),
      },
      relations: {
        author: {
          settings: true,
        },
      },
    });

    if (!topic) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Topic not found',
        'Topic not found',
        'TOPIC_NOT_FOUND',
      );
    }

    if (topic.status !== ForumContentStatus.REMOVED_BY_MODERATOR) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Only moderator-removed topic can be restored',
        'Only moderator-removed topic can be restored',
        'ONLY_MODERATOR_REMOVED_TOPIC_CAN_BE_RESTORED',
      );
    }

    await this.topicsRepo.update(topic.id, {
      status: ForumContentStatus.PUBLISHED,

      moderationRemovedAt: null,
      moderationRemovedByAdminId: null,
      moderationRemoveReason: null,
      moderationRemoveNote: null,
    });

    if (dto.targetUserId !== topic.authorId) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Target user does not match topic author',
        'Target user does not match topic author',
        'TARGET_USER_DOES_NOT_MATCH_TOPIC_AUTHOR',
      );
    }

    await this.moderationLogsService.create({
      moderatorId: dto.moderationRestoredByAdminId,
      targetUserId: topic.authorId,
      action: ForumModerationAction.RESTORE_TOPIC,
      targetType: ForumModerationTargetType.TOPIC,
      targetId: topic.id,
      reason: topic.moderationRemoveReason ?? null,
      note: topic.moderationRemoveNote ?? null,
      metadataJson: {
        topicId: topic.id,
        authorId: topic.authorId,
        previousStatus: topic.status,
        restoredFromReason: topic.moderationRemoveReason,
        restoredFromNote: topic.moderationRemoveNote,
      },
    });

    const authorLang = topic.author?.settings?.lang ?? 'en';

    const text = getForumRestoreTopicPushText({
      locale: authorLang,
      topicTitle: topic.title,
    });

    await this.pushNotificationsService.sendForumTopicRestoredByModeratorPush({
      topicId: topic.id,
      userId: topic.authorId,
      title: text.title,
      body: text.body,
    });

    const updatedTopic = await this.topicsRepo.findOne({
      where: {
        id: topic.id,
      },
      relations: {
        category: true,
        author: true,
      },
    });

    if (!updatedTopic) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Updated topic not found',
        'Updated topic not found',
        'UPDATED_TOPIC_NOT_FOUND',
      );
    }

    return updatedTopic;
  }

  async deleteTopic(topicId: string) {
    const topic = await this.topicsRepo.findOne({
      where: {
        id: topicId,
      },
    });

    if (!topic) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Topic not found',
        'Topic not found',
        'TOPIC_NOT_FOUND',
      );
    }

    await this.topicsRepo.delete(topic.id);

    return { success: true };
  }

  async removeComment(commentId: string, dto: ForumTopicModerationRemoveDto) {
    const comment = await this.commentsRepo.findOne({
      where: {
        id: commentId,
        deletedAt: IsNull(),
      },
      relations: {
        author: {
          settings: true,
        },
      },
    });

    if (!comment) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Comment not found',
        'Comment not found',
        'COMMENT_NOT_FOUND',
      );
    }

    if (comment.status === ForumContentStatus.REMOVED_BY_MODERATOR) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Comment already removed by moderator',
        'Comment already removed by moderator',
        'COMMENT_ALREADY_REMOVED_BY_MODERATOR',
      );
    }

    if (comment.status === ForumContentStatus.REMOVED_BY_AUTHOR) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Author-removed comment cannot be removed by moderator',
        'Author-removed comment cannot be removed by moderator',
        'AUTHOR_REMOVED_COMMENT_CANNOT_BE_REMOVED_BY_MODERATOR',
      );
    }

    await this.commentsRepo.update(comment.id, {
      status: ForumContentStatus.REMOVED_BY_MODERATOR,
      moderationRemovedAt: new Date(),
      moderationRemovedByAdminId: dto.moderationRemovedByAdminId,
      moderationRemoveReason: dto.moderationRemoveReason,
      moderationRemoveNote: dto.moderationRemoveNote?.trim() || null,
    });

    if (dto.targetUserId !== comment.authorId) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Target user does not match topic author',
        'Target user does not match topic author',
        'TARGET_USER_DOES_NOT_MATCH_TOPIC_AUTHOR',
      );
    }

    await this.moderationLogsService.create({
      moderatorId: dto.moderationRemovedByAdminId,
      targetUserId: comment.authorId,
      action: ForumModerationAction.REMOVE_COMMENT,
      targetType: ForumModerationTargetType.COMMENT,
      targetId: comment.id,
      reason: dto.moderationRemoveReason,
      note: dto.moderationRemoveNote?.trim() || null,
      metadataJson: {
        commentId: comment.id,
        topicId: comment.topicId,
        authorId: comment.authorId,
        parentCommentId: comment.parentCommentId,
        replyToCommentId: comment.replyToCommentId,
        previousStatus: comment.status,
      },
    });

    const authorLang = comment.author?.settings?.lang ?? 'en';

    const text = getForumRemoveCommentPushText({
      locale: authorLang,
      commentContent:
        comment.content.length > 30
          ? `${comment.content.slice(0, 30)}...`
          : comment.content,
      note: dto.moderationRemoveNote,
    });

    await this.pushNotificationsService.sendForumCommentRemovedByModeratorPush({
      commentId: comment.id,
      userId: comment.authorId,
      title: text.title,
      body: text.body,
    });

    const updatedComment = await this.commentsRepo
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.parentComment', 'parentComment')
      .leftJoinAndSelect('comment.replyToComment', 'replyToComment')
      .leftJoinAndMapOne(
        'comment.authorProfile',
        ForumPublicProfile,
        'authorProfile',
        'authorProfile.userId = comment.authorId',
      )
      .where('comment.id = :commentId', { commentId: comment.id })
      .getOne();

    if (!updatedComment) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Updated comment not found',
        'Updated comment not found',
        'UPDATED_COMMENT_NOT_FOUND',
      );
    }

    return updatedComment;
  }

  async restoreComment(commentId: string, dto: ForumTopicModerationRestoreDto) {
    const comment = await this.commentsRepo.findOne({
      where: {
        id: commentId,
        deletedAt: IsNull(),
      },
      relations: {
        author: {
          settings: true,
        },
      },
    });

    if (!comment) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Comment not found',
        'Comment not found',
        'COMMENT_NOT_FOUND',
      );
    }

    if (comment.status !== ForumContentStatus.REMOVED_BY_MODERATOR) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Only moderator-removed comment can be restored',
        'Only moderator-removed comment can be restored',
        'ONLY_MODERATOR_REMOVED_COMMENT_CAN_BE_RESTORED',
      );
    }

    await this.commentsRepo.update(comment.id, {
      status: ForumContentStatus.PUBLISHED,
      moderationRemovedAt: null,
      moderationRemovedByAdminId: null,
      moderationRemoveReason: null,
      moderationRemoveNote: null,
    });

    if (dto.targetUserId !== comment.authorId) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Target user does not match topic author',
        'Target user does not match topic author',
        'TARGET_USER_DOES_NOT_MATCH_TOPIC_AUTHOR',
      );
    }

    await this.moderationLogsService.create({
      moderatorId: dto.moderationRestoredByAdminId,
      targetUserId: comment.authorId,
      action: ForumModerationAction.RESTORE_COMMENT,
      targetType: ForumModerationTargetType.COMMENT,
      targetId: comment.id,
      reason: comment.moderationRemoveReason ?? null,
      note: comment.moderationRemoveNote ?? null,
      metadataJson: {
        commentId: comment.id,
        topicId: comment.topicId,
        authorId: comment.authorId,
        parentCommentId: comment.parentCommentId,
        replyToCommentId: comment.replyToCommentId,
        previousStatus: comment.status,
        restoredFromReason: comment.moderationRemoveReason,
        restoredFromNote: comment.moderationRemoveNote,
      },
    });

    const authorLang = comment.author?.settings?.lang ?? 'en';

    const text = getForumRestoreCommentPushText({
      locale: authorLang,
      commentContent:
        comment.content.length > 30
          ? `${comment.content.slice(0, 30)}...`
          : comment.content,
    });

    await this.pushNotificationsService.sendForumCommentRestoredByModeratorPush(
      {
        commentId: comment.id,
        userId: comment.authorId,
        title: text.title,
        body: text.body,
      },
    );

    const updatedComment = await this.commentsRepo
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.parentComment', 'parentComment')
      .leftJoinAndSelect('comment.replyToComment', 'replyToComment')
      .leftJoinAndMapOne(
        'comment.authorProfile',
        ForumPublicProfile,
        'authorProfile',
        'authorProfile.userId = comment.authorId',
      )
      .where('comment.id = :commentId', { commentId: comment.id })
      .getOne();

    if (!updatedComment) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Updated comment not found',
        'Updated comment not found',
        'UPDATED_COMMENT_NOT_FOUND',
      );
    }

    return updatedComment;
  }
}
