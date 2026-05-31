import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { ForumComment } from '../entities/forum-comment.entity';
import { ForumTopic } from '../entities/forum-topic.entity';
import { CreateForumCommentDto } from '../dto/create-forum-comment.dto';
import { ForumContentStatus } from '../types/forum-content-status.enum';
import { ForumTopicWatcher } from '../entities/forum-topic-watcher.entity';
import { ForumTopicWatchType } from '../types/forum-topic-watch-type.enum';
import { ForumPublicProfile } from '../entities/forum-public-profile.entity';
import { ForumReaction } from '../entities/forum-reaction.entity';
import { ForumReactionTargetType } from '../types/forum-reaction-target-type.enum';
import { ForumReactionType } from '../types/forum-reaction-type.enum';
import { UpdateForumCommentDto } from '../dto/update-forum-comment.dto';
import { ForumTopicReadState } from '../entities/forum-topic-read-state.entity';
import { User } from '../../users/entities/user.entity';
import { sendForumFeedTelegram } from '../../telegram/send-telegram';
import { UserPushToken } from 'src/push-notifications/entities/user-push-token.entity';
import { PushNotificationsService } from 'src/push-notifications/push-notifications.service';
import { getForumNewCommentPushText } from 'src/push-notifications/utils/getForumNewCommentPushText';
import { ForumUserRestrictionsService } from './forum-user-restrictions.service';
import { assertCommentCanBeRepliedTo } from '../utils/assert-comment-can-be-replied-to';
import { throwError } from '../../common/utils';
import { HttpStatus } from '../../common/utils/http-status';
import { ForumModerationService } from 'src/forum-moderation/forum-moderation.service';
import { ForumModerationTargetType } from '../../forum-moderation/enums/forum-moderation-target-type.enum';
import { formatForumCommentActionTelegram } from '../utils/telegram-feed-formatter';
import { ForumAccessService } from '../../forum-access/forum-access.service';
import { CommunityGateway } from '../gateway/community.gateway';

type ForumCommentWithMyLike = ForumComment & {
  myLike?: ForumReaction | null;
};

type ForumCommentResponse = ForumComment & {
  likedByMe: boolean;
};

@Injectable()
export class ForumCommentsService {
  constructor(
    @InjectRepository(ForumComment)
    private readonly commentsRepo: Repository<ForumComment>,

    @InjectRepository(ForumTopic)
    private readonly topicsRepo: Repository<ForumTopic>,

    @InjectRepository(ForumPublicProfile)
    private readonly forumPublicProfileRepo: Repository<ForumPublicProfile>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(ForumTopicReadState)
    private readonly forumTopicReadStateRepo: Repository<ForumTopicReadState>,

    private readonly pushNotificationsService: PushNotificationsService,

    @InjectDataSource()
    private readonly dataSource: DataSource,

    private readonly forumUserRestrictionsService: ForumUserRestrictionsService,

    private readonly forumModerationService: ForumModerationService,
    private readonly forumAccessService: ForumAccessService,
    private readonly communityGateway: CommunityGateway,
  ) {}

  async getTopicComments(
    topicId: string,
    userId: number,
  ): Promise<ForumCommentResponse[]> {
    const topic = await this.topicsRepo.findOne({
      where: {
        id: topicId,
        status: ForumContentStatus.PUBLISHED,
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

    const comments = await this.commentsRepo
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.parentComment', 'parentComment')
      .leftJoinAndSelect('comment.replyToComment', 'replyToComment')

      .leftJoinAndMapOne(
        'comment.authorProfile',
        ForumPublicProfile,
        'authorProfile',
        'authorProfile.userId = comment.authorId',
      )
      .leftJoinAndSelect('comment.author', 'author')

      .leftJoinAndMapOne(
        'parentComment.authorProfile',
        ForumPublicProfile,
        'parentAuthorProfile',
        'parentAuthorProfile.userId = parentComment.authorId',
      )
      .leftJoinAndSelect('parentComment.author', 'parentAuthor')

      .leftJoinAndMapOne(
        'replyToComment.authorProfile',
        ForumPublicProfile,
        'replyToAuthorProfile',
        'replyToAuthorProfile.userId = replyToComment.authorId',
      )
      .leftJoinAndSelect('replyToComment.author', 'replyToAuthor')

      .leftJoinAndMapOne(
        'comment.myLike',
        ForumReaction,
        'myLike',
        `
      myLike.targetId = comment.id
      AND myLike.targetType = :commentTargetType
      AND myLike.reactionType = :likeReactionType
      AND myLike.userId = :userId
    `,
      )
      .where('comment.topicId = :topicId', { topicId })
      .andWhere('comment.status IN (:...statuses)', {
        statuses: [
          ForumContentStatus.PUBLISHED,
          ForumContentStatus.REMOVED_BY_AUTHOR,
          ForumContentStatus.REMOVED_BY_MODERATOR,
        ],
      })
      .andWhere('comment.deletedAt IS NULL')
      .setParameters({
        userId,
        commentTargetType: ForumReactionTargetType.COMMENT,
        likeReactionType: ForumReactionType.LIKE,
      })
      .orderBy('comment.createdAt', 'ASC')
      .getMany();

    const visibleStatuses = new Set<ForumContentStatus>([
      ForumContentStatus.PUBLISHED,
    ]);

    const placeholderStatuses = new Set<ForumContentStatus>([
      ForumContentStatus.REMOVED_BY_AUTHOR,
      ForumContentStatus.REMOVED_BY_MODERATOR,
    ]);

    const visibleCommentIds = new Set(
      comments
        .filter((comment) => visibleStatuses.has(comment.status))
        .map((comment) => comment.id),
    );

    const hasVisibleReplyByParentId = new Map<string, boolean>();

    for (const comment of comments) {
      if (!comment.parentCommentId) continue;

      if (visibleCommentIds.has(comment.id)) {
        hasVisibleReplyByParentId.set(comment.parentCommentId, true);
      }
    }

    const shouldReturnComment = (comment: ForumComment) => {
      if (visibleStatuses.has(comment.status)) {
        return true;
      }

      if (placeholderStatuses.has(comment.status)) {
        return hasVisibleReplyByParentId.get(comment.id) === true;
      }

      return false;
    };

    return comments
      .filter(shouldReturnComment)
      .map((comment): ForumCommentResponse => {
        const commentWithMyLike = comment as ForumCommentWithMyLike;
        const { myLike, ...rest } = commentWithMyLike;

        return {
          ...rest,
          likedByMe: Boolean(myLike),
        };
      });
  }

  async createComment(
    userId: number,
    topicId: string,
    dto: CreateForumCommentDto,
  ) {
    await this.forumUserRestrictionsService.assertCanWrite(userId);
    await this.forumAccessService.assertCanCreateComment(userId);

    const content = dto.content.trim();

    if (!content) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Comment content is required',
        'Comment content is required',
        'COMMENT_CONTENT_IS_REQUIRED',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const topicRepo = manager.getRepository(ForumTopic);
      const commentRepo = manager.getRepository(ForumComment);

      const topic = await topicRepo.findOne({
        where: {
          id: topicId,
        },
        withDeleted: true,
      });

      if (!topic) {
        throwError(
          HttpStatus.NOT_FOUND,
          'Topic not found',
          'Topic not found',
          'TOPIC_NOT_FOUND',
        );
      }

      this.assertTopicCanBeCommented(topic);

      if (topic.isLocked) {
        throwError(
          HttpStatus.FORBIDDEN,
          'Topic is locked',
          'Topic is locked',
          'TOPIC_IS_LOCKED',
        );
      }

      const authorPublicProfile = await this.forumPublicProfileRepo.findOne({
        where: { userId },
        select: {
          username: true,
        },
      });

      const authorNickname = authorPublicProfile?.username?.trim() || 'Someone';

      let parentCommentId: string | null = null;
      let replyToCommentId: string | null = null;

      if (dto.replyToCommentId) {
        const replyTarget = await commentRepo.findOne({
          where: {
            id: dto.replyToCommentId,
            topicId,
          },
          withDeleted: true,
        });

        this.assertCommentCanBeRepliedTo(replyTarget);

        parentCommentId = replyTarget.parentCommentId
          ? replyTarget.parentCommentId
          : replyTarget.id;

        replyToCommentId = replyTarget?.parentCommentId ? replyTarget.id : null;
      } else if (dto.parentCommentId) {
        const parentComment = await commentRepo.findOne({
          where: {
            id: dto.parentCommentId,
            topicId,
          },
          withDeleted: true,
        });

        this.assertCommentCanBeRepliedTo(parentComment);

        parentCommentId = parentComment.parentCommentId
          ? parentComment.parentCommentId
          : parentComment.id;

        replyToCommentId = null;
      }

      await this.forumModerationService.moderateOrThrow({
        userId,
        targetType: ForumModerationTargetType.COMMENT,
        actionType: 'create',
        content,
      });

      const comment = commentRepo.create({
        topicId,
        authorId: userId,
        parentCommentId,
        replyToCommentId,
        content,
        status: ForumContentStatus.PUBLISHED,
      });

      const savedComment = await commentRepo.save(comment);

      await this.forumAccessService.incrementCommentUsage(userId, manager);

      this.communityGateway.emitCommunityUnreadChanged();

      await this.sendNewCommentPushNotifications({
        manager,
        topicId,
        commentId: savedComment.id,
        actorId: userId,
        authorName: authorNickname,
        topicTitle: topic.title,
      });

      await sendForumFeedTelegram(
        formatForumCommentActionTelegram({
          actionType: 'new',
          content,
          commentId: savedComment.id,
          topicId,
          authorId: userId,
          topicTitle: topic.title,
          authorNickname,
        }),
      );

      const savedCommentWithAuthorProfile = await commentRepo
        .createQueryBuilder('comment')
        .leftJoinAndSelect('comment.author', 'author')
        .leftJoinAndSelect('comment.replyToComment', 'replyToComment')
        .leftJoinAndSelect('replyToComment.author', 'replyToAuthor')
        .leftJoinAndMapOne(
          'comment.authorProfile',
          ForumPublicProfile,
          'authorProfile',
          'authorProfile.userId = comment.authorId',
        )
        .leftJoinAndMapOne(
          'replyToComment.authorProfile',
          ForumPublicProfile,
          'replyToAuthorProfile',
          'replyToAuthorProfile.userId = replyToComment.authorId',
        )
        .where('comment.id = :commentId', { commentId: savedComment.id })
        .getOne();

      if (!savedCommentWithAuthorProfile) {
        throwError(
          HttpStatus.FORBIDDEN,
          'Saved comment not found',
          'Saved comment not found',
          'COMMENT_NOT_FOUND',
        );
      }

      const watcherRepo = manager.getRepository(ForumTopicWatcher);
      const now = new Date();

      const existingWatcher = await watcherRepo.findOne({
        where: {
          userId,
          topicId,
        },
      });

      if (!existingWatcher) {
        await watcherRepo.save(
          watcherRepo.create({
            userId,
            topicId,
            watchType: ForumTopicWatchType.AUTO_COMMENTER,
            isMuted: false,
            lastReadAt: now,
          }),
        );

        await topicRepo.update(topicId, {
          watchersCount: () => '"watchers_count" + 1',
        });
      } else {
        await watcherRepo.update(
          {
            userId,
            topicId,
          },
          {
            lastReadAt: now,
          },
        );
      }

      await topicRepo.update(topicId, {
        commentsCount: () => '"comments_count" + 1',
        lastActivityAt: now,
        lastCommentAuthorId: userId,
        lastCommentId: savedComment.id,
      });

      return savedCommentWithAuthorProfile;
    });
  }

  private assertCommentCanBeRepliedTo(
    comment: ForumComment | null,
  ): asserts comment is ForumComment {
    if (!comment) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Comment not found',
        'Comment not found',
        'COMMENT_NOT_FOUND',
      );
    }

    if (comment.deletedAt) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Comment was deleted',
        'This comment was deleted by its author. You can no longer reply to it',
        'COMMENT_WAS_DELETED_BY_AUTHOR',
      );
    }

    if (comment.status === ForumContentStatus.REMOVED_BY_MODERATOR) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Comment was removed',
        'This comment was removed by a moderator. You can no longer reply to it',
        'COMMENT_WAS_REMOVED_BY_MODERATOR',
      );
    }

    if (comment.status === ForumContentStatus.REMOVED_BY_AUTHOR) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Comment was deleted',
        'This comment was deleted by its author. You can no longer reply to it',
        'COMMENT_WAS_DELETED_BY_AUTHOR',
      );
    }

    if (comment.status !== ForumContentStatus.PUBLISHED) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'You can no longer reply to this comment',
        'You can no longer reply to this comment',
        'YOU_CAN_NO_LONGER_REPLY_TO_THIS_COMMENT',
      );
    }
  }

  private assertTopicCanBeCommented(
    topic: ForumTopic | null,
  ): asserts topic is ForumTopic {
    if (!topic) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Topic not found',
        'Topic not found',
        'TOPIC_NOT_FOUND',
      );
    }

    if (topic.deletedAt) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Topic was deleted',
        'This topic was deleted by its author. You can no longer reply to it',
        'TOPIC_WAS_DELETED_BY_AUTHOR',
      );
    }

    if (topic.status === ForumContentStatus.REMOVED_BY_MODERATOR) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Topic was removed',
        'This topic was removed by a moderator. You can no longer reply to it',
        'TOPIC_WAS_REMOVED_BY_MODERATOR',
      );
    }

    if (topic.status === ForumContentStatus.REMOVED_BY_AUTHOR) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Topic was deleted',
        'This topic was deleted by its author. You can no longer reply to it',
        'TOPIC_WAS_DELETED_BY_AUTHOR',
      );
    }

    if (topic.status !== ForumContentStatus.PUBLISHED) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'You can no longer reply to this topic',
        'You can no longer reply to this topic',
        'YOU_CAN_NO_LONGER_REPLY_TO_THIS_TOPIC',
      );
    }

    if (topic.isLocked) {
      throwError(
        HttpStatus.FORBIDDEN,
        'Topic is locked',
        'Topic is locked',
        'TOPIC_IS_LOCKED',
      );
    }
  }

  async markCommentRead(userId: number, commentId: string) {
    const comment = await this.commentsRepo.findOne({
      where: {
        id: commentId,
        status: ForumContentStatus.PUBLISHED,
        deletedAt: IsNull(),
      },
      select: {
        id: true,
        topicId: true,
        authorId: true,
        createdAt: true,
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

    const topic = await this.topicsRepo.findOne({
      where: {
        id: comment.topicId,
        status: ForumContentStatus.PUBLISHED,
        deletedAt: IsNull(),
      },
      select: {
        id: true,
        createdAt: true,
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

    let readState = await this.forumTopicReadStateRepo.findOne({
      where: {
        userId,
        topicId: comment.topicId,
      },
      select: {
        id: true,
        userId: true,
        topicId: true,
        firstViewedAt: true,
        lastReadAt: true,
        lastReadCommentId: true,
      },
    });

    if (!readState) {
      readState = this.forumTopicReadStateRepo.create({
        userId,
        topicId: comment.topicId,
        firstViewedAt: new Date(),
        lastReadAt: topic.createdAt,
        lastReadCommentId: null,
      });
    }

    if (!readState.firstViewedAt) {
      readState.firstViewedAt = new Date();
    }

    if (comment.createdAt >= readState.lastReadAt) {
      readState.lastReadAt = new Date(comment.createdAt.getTime() + 1);
      readState.lastReadCommentId = comment.id;
    }

    await this.forumTopicReadStateRepo.save(readState);

    return {
      success: true,
      topicId: comment.topicId,
      commentId: comment.id,
      lastReadAt: readState.lastReadAt,
      lastReadCommentId: readState.lastReadCommentId,
    };
  }

  async updateComment(
    userId: number,
    commentId: string,
    dto: UpdateForumCommentDto,
  ) {
    const content = dto.content.trim();

    if (!content) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Comment content is required',
        'Comment content is required',
        'COMMENT_CONTENT_IS_REQUIRED',
      );
    }

    const comment = await this.commentsRepo.findOne({
      where: {
        id: commentId,
        status: ForumContentStatus.PUBLISHED,
        deletedAt: IsNull(),
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

    if (comment.authorId !== userId) {
      throwError(
        HttpStatus.FORBIDDEN,
        'You cannot edit this comment',
        'You cannot edit this comment',
        'YOU_CANNOT_EDIT_THIS_COMMENT',
      );
    }

    const topic = await this.topicsRepo.findOne({
      where: {
        id: comment.topicId,
        status: ForumContentStatus.PUBLISHED,
        deletedAt: IsNull(),
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

    if (topic.isLocked) {
      throwError(
        HttpStatus.FORBIDDEN,
        'Topic is locked',
        'Topic is locked',
        'TOPIC_IS_LOCKED',
      );
    }

    const authorPublicProfile = await this.forumPublicProfileRepo.findOne({
      where: { userId },
      select: {
        username: true,
      },
    });

    const authorNickname = authorPublicProfile?.username?.trim() || 'Someone';

    await this.forumModerationService.moderateOrThrow({
      userId,
      targetType: ForumModerationTargetType.COMMENT,
      actionType: 'update',
      targetId: commentId,
      content,
    });

    await this.commentsRepo.update(commentId, {
      content,
      isEdited: true,
      editedAt: new Date(),
    });

    await sendForumFeedTelegram(
      formatForumCommentActionTelegram({
        actionType: 'update',
        content,
        commentId: commentId,
        topicId: topic.id,
        authorId: userId,
        topicTitle: topic.title,
        authorNickname,
      }),
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
      .leftJoinAndMapOne(
        'replyToComment.authorProfile',
        ForumPublicProfile,
        'replyToAuthorProfile',
        'replyToAuthorProfile.userId = replyToComment.authorId',
      )
      .where('comment.id = :commentId', { commentId })
      .getOne();

    if (!updatedComment) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Updated comment not found',
        'Updated comment not found',
        'UPDATED_COMMENT_NOT_FOUND',
      );
    }

    return {
      ...updatedComment,
    };
  }

  async softDeleteComment(userId: number, commentId: string) {
    const comment = await this.commentsRepo.findOne({
      where: {
        id: commentId,
        status: ForumContentStatus.PUBLISHED,
        deletedAt: IsNull(),
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

    if (comment.authorId !== userId) {
      throwError(
        HttpStatus.FORBIDDEN,
        'You cannot soft delete this comment',
        'You cannot soft delete this comment',
        'YOU_CANNOT_SOFT_DELETE_THIS_COMMENT',
      );
    }

    const topic = await this.topicsRepo.findOne({
      where: {
        id: comment.topicId,
        status: ForumContentStatus.PUBLISHED,
        deletedAt: IsNull(),
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

    if (topic.isLocked) {
      throwError(
        HttpStatus.FORBIDDEN,
        'Topic is locked',
        'Topic is locked',
        'TOPIC_IS_LOCKED',
      );
    }

    await this.commentsRepo.update(commentId, {
      status: ForumContentStatus.REMOVED_BY_AUTHOR,
      content: '',
      isDeletedByAuthor: true,
      deletedByAuthorAt: new Date(),
    });

    await this.topicsRepo.update(comment.topicId, {
      commentsCount: () => 'GREATEST("comments_count" - 1, 0)',
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
      .leftJoinAndMapOne(
        'replyToComment.authorProfile',
        ForumPublicProfile,
        'replyToAuthorProfile',
        'replyToAuthorProfile.userId = replyToComment.authorId',
      )
      .where('comment.id = :commentId', { commentId })
      .getOne();

    if (!updatedComment) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Updated comment not found',
        'Updated comment not found',
        'UPDATED_COMMENT_NOT_FOUND',
      );
    }

    return {
      ...updatedComment,
    };
  }

  async deleteComment(userId: number, commentId: string) {
    const comment = await this.commentsRepo.findOne({
      where: {
        id: commentId,
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

    if (comment.authorId !== userId) {
      throwError(
        HttpStatus.NOT_FOUND,
        'You cannot delete this comment',
        'You cannot delete this comment',
        'YOU_CANNOT_DELETE_THIS_COMMENT',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const commentRepo = manager.getRepository(ForumComment);
      const topicRepo = manager.getRepository(ForumTopic);

      await commentRepo.softDelete(commentId);

      await topicRepo.update(comment.topicId, {
        commentsCount: () => 'GREATEST("comments_count" - 1, 0)',
      });
    });

    this.communityGateway.emitCommunityUnreadChanged();

    return { success: true };
  }

  async sendNewCommentPushNotifications(params: {
    manager: EntityManager;
    topicId: string;
    commentId: string;
    actorId: number;
    authorName: string;
    topicTitle: string;
  }) {
    const watcherRepo = params.manager.getRepository(ForumTopicWatcher);
    const pushTokenRepo = params.manager.getRepository(UserPushToken);

    const watchers = await watcherRepo.find({
      where: {
        topicId: params.topicId,
        isMuted: false,
      },
    });

    const recipientUserIds = watchers
      .filter((watcher) => watcher.userId !== params.actorId)
      .map((watcher) => watcher.userId);

    if (!recipientUserIds.length) return;

    const pushTokens = await pushTokenRepo.find({
      where: {
        userId: In(recipientUserIds),
        isActive: true,
      },
    });

    if (!pushTokens.length) return;

    await Promise.all(
      pushTokens.map((pushToken) => {
        const text = getForumNewCommentPushText({
          locale: pushToken.locale,
          authorName: params.authorName,
          topicTitle: params.topicTitle,
        });

        return this.pushNotificationsService.sendForumNewCommentPush({
          tokens: [pushToken.token],
          topicId: params.topicId,
          commentId: params.commentId,
          title: text.title,
          body: text.body,
        });
      }),
    );
  }
}
