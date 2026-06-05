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
import { UserStatisticsService } from 'src/user-statistics/user-statistics.service';

type ForumCommentWithMyLike = ForumComment & {
  myLike?: ForumReaction | null;
};

type ForumCommentResponse = ForumComment & {
  likedByMe: boolean;
};

export type ForumCommentsPagination = {
  cursor: string | null;
  hasMore: boolean;
};

export type TopicCommentsPageResponse = {
  comments: ForumComment[];
  cursor: string | null;
  hasMore: boolean;
  repliesPaginationByParentId?: Record<string, ForumCommentsPagination>;
};

export type CommentContextPaginationDto = {
  beforeCursor: string | null;
  afterCursor: string | null;
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
};

export type CommentContextResponse = {
  targetCommentId: string;
  rootCommentId: string;
  comments: ForumCommentResponse[];
  rootPagination: CommentContextPaginationDto;
  repliesPaginationByParentId: Record<string, CommentContextPaginationDto>;
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
    private readonly userStatisticsService: UserStatisticsService,
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

      await this.userStatisticsService.incrementCommentStat(userId);

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

    // if (!readState.firstViewedAt) {
    //   readState.firstViewedAt = new Date();
    // }

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

  private encodeCommentCursor(comment: ForumComment): string {
    return Buffer.from(
      JSON.stringify({
        createdAt: comment.createdAt.toISOString(),
        id: comment.id,
      }),
    ).toString('base64');
  }

  private decodeCommentCursor(cursor?: string | null): {
    createdAt: string;
    id: string;
  } | null {
    if (!cursor) return null;

    try {
      return JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
    } catch {
      return null;
    }
  }

  async getRootCommentsPage(params: {
    topicId: string;
    userId: number;
    cursor?: string | null;
    rootLimit: number;
    replyPreviewLimit: number;
  }): Promise<{
    comments: ForumCommentResponse[];
    cursor: string | null;
    hasMore: boolean;
    repliesPaginationByParentId: Record<
      string,
      {
        cursor: string | null;
        hasMore: boolean;
      }
    >;
  }> {
    const { topicId, userId, cursor, rootLimit, replyPreviewLimit } = params;

    const decodedCursor = this.decodeCommentCursor(cursor);

    const rootQb = this.buildCommentsBaseQb(userId)
      .andWhere('comment.topicId = :topicId', { topicId })
      .andWhere('comment.parentCommentId IS NULL')
      .orderBy('comment.createdAt', 'ASC')
      .addOrderBy('comment.id', 'ASC')
      .take(rootLimit + 1);

    if (decodedCursor) {
      rootQb.andWhere(
        `(comment.createdAt > :cursorCreatedAt 
        OR (comment.createdAt = :cursorCreatedAt AND comment.id > :cursorId))`,
        {
          cursorCreatedAt: decodedCursor.createdAt,
          cursorId: decodedCursor.id,
        },
      );
    }

    const rootsRaw = await rootQb.getMany();

    const hasMore = rootsRaw.length > rootLimit;
    const roots = rootsRaw.slice(0, rootLimit);

    const nextCursor =
      hasMore && roots.length
        ? this.encodeCommentCursor(roots[roots.length - 1])
        : null;

    const comments: ForumCommentResponse[] = [];
    const repliesPaginationByParentId: Record<
      string,
      { cursor: string | null; hasMore: boolean }
    > = {};

    for (const root of roots) {
      comments.push(this.mapCommentResponse(root));

      const repliesRaw = await this.buildCommentsBaseQb(userId)
        .andWhere('comment.topicId = :topicId', { topicId })
        .andWhere('comment.parentCommentId = :parentId', {
          parentId: root.id,
        })
        .orderBy('comment.createdAt', 'ASC')
        .addOrderBy('comment.id', 'ASC')
        .take(replyPreviewLimit + 1)
        .getMany();

      const repliesHasMore = repliesRaw.length > replyPreviewLimit;
      const replies = repliesRaw.slice(0, replyPreviewLimit);

      comments.push(...replies.map((reply) => this.mapCommentResponse(reply)));

      repliesPaginationByParentId[root.id] = {
        cursor:
          repliesHasMore && replies.length
            ? this.encodeCommentCursor(replies[replies.length - 1])
            : null,
        hasMore: repliesHasMore,
      };
    }

    return {
      comments,
      cursor: nextCursor,
      hasMore,
      repliesPaginationByParentId,
    };
  }

  async getRepliesPage(params: {
    parentId: string;
    userId: number;
    cursor?: string | null;
    limit: number;
  }): Promise<{
    comments: ForumCommentResponse[];
    cursor: string | null;
    hasMore: boolean;
  }> {
    const { parentId, userId, cursor, limit } = params;

    const decodedCursor = this.decodeCommentCursor(cursor);

    const qb = this.buildCommentsBaseQb(userId)
      .andWhere('comment.parentCommentId = :parentId', { parentId })
      .orderBy('comment.createdAt', 'ASC')
      .addOrderBy('comment.id', 'ASC')
      .take(limit + 1);

    if (decodedCursor) {
      qb.andWhere(
        `(comment.createdAt > :cursorCreatedAt 
        OR (comment.createdAt = :cursorCreatedAt AND comment.id > :cursorId))`,
        {
          cursorCreatedAt: decodedCursor.createdAt,
          cursorId: decodedCursor.id,
        },
      );
    }

    const rowsRaw = await qb.getMany();

    const hasMore = rowsRaw.length > limit;
    const rows = rowsRaw.slice(0, limit);

    return {
      comments: rows.map((comment) => this.mapCommentResponse(comment)),
      cursor:
        hasMore && rows.length
          ? this.encodeCommentCursor(rows[rows.length - 1])
          : null,
      hasMore,
    };
  }

  private buildCommentsBaseQb(userId: number) {
    return this.commentsRepo
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
      });
  }

  private mapCommentResponse(comment: ForumComment): ForumCommentResponse {
    const commentWithMyLike = comment as ForumCommentWithMyLike;
    const { myLike, ...rest } = commentWithMyLike;

    return {
      ...rest,
      likedByMe: Boolean(myLike),
    };
  }

  async getCommentContext(params: {
    commentId: string;
    userId: number;
    rootAroundLimit: number;
    repliesAroundLimit: number;
    replyPreviewLimit: number;
  }): Promise<CommentContextResponse> {
    const { commentId, userId, rootAroundLimit, repliesAroundLimit } = params;

    const beforeLimit = rootAroundLimit;
    const afterLimit = repliesAroundLimit;

    const target = await this.commentsRepo.findOne({
      where: { id: commentId, deletedAt: IsNull() },
    });

    if (!target) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Comment not found',
        'Comment not found',
        'COMMENT_NOT_FOUND',
      );
    }

    const rootCommentId = target.parentCommentId ?? target.id;

    const root = await this.commentsRepo.findOne({
      where: { id: rootCommentId, deletedAt: IsNull() },
    });

    if (!root) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Root comment not found',
        'Root comment not found',
        'ROOT_COMMENT_NOT_FOUND',
      );
    }

    const targetFull = await this.buildCommentsBaseQb(userId)
      .andWhere('comment.id = :targetId', { targetId: target.id })
      .getOne();

    if (!targetFull) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Comment not found',
        'Comment not found',
        'COMMENT_NOT_FOUND',
      );
    }

    const rootFull = await this.buildCommentsBaseQb(userId)
      .andWhere('comment.id = :rootId', { rootId: root.id })
      .getOne();

    if (!rootFull) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Root comment not found',
        'Root comment not found',
        'ROOT_COMMENT_NOT_FOUND',
      );
    }

    const anchorRootsById = new Map<string, ForumComment>();

    const repliesPaginationByParentId: Record<
      string,
      CommentContextPaginationDto
    > = {};

    const ensureAnchorRoot = (rootComment: ForumComment) => {
      anchorRootsById.set(rootComment.id, rootComment);
    };

    const getRepliesBefore = async (
      parentId: string,
      cursorComment: ForumComment,
      limit: number,
    ) => {
      const raw = await this.buildCommentsBaseQb(userId)
        .andWhere('comment.parentCommentId = :parentId', { parentId })
        .andWhere('comment.id != :cursorId', { cursorId: cursorComment.id })
        .andWhere(
          `(comment.createdAt < :createdAt 
        OR (comment.createdAt = :createdAt AND comment.id < :id))`,
          {
            createdAt: cursorComment.createdAt,
            id: cursorComment.id,
          },
        )
        .orderBy('comment.createdAt', 'DESC')
        .addOrderBy('comment.id', 'DESC')
        .take(limit + 1)
        .getMany();

      return {
        hasMore: raw.length > limit,
        rows: raw.slice(0, limit).reverse(),
      };
    };

    const getRepliesAfter = async (
      parentId: string,
      cursorComment: ForumComment,
      limit: number,
    ) => {
      const raw = await this.buildCommentsBaseQb(userId)
        .andWhere('comment.parentCommentId = :parentId', { parentId })
        .andWhere('comment.id != :cursorId', { cursorId: cursorComment.id })
        .andWhere(
          `(comment.createdAt > :createdAt 
        OR (comment.createdAt = :createdAt AND comment.id > :id))`,
          {
            createdAt: cursorComment.createdAt,
            id: cursorComment.id,
          },
        )
        .orderBy('comment.createdAt', 'ASC')
        .addOrderBy('comment.id', 'ASC')
        .take(limit + 1)
        .getMany();

      return {
        hasMore: raw.length > limit,
        rows: raw.slice(0, limit),
      };
    };

    const getRootsBefore = async (cursorRoot: ForumComment, limit: number) => {
      const raw = await this.buildCommentsBaseQb(userId)
        .andWhere('comment.topicId = :topicId', { topicId: cursorRoot.topicId })
        .andWhere('comment.parentCommentId IS NULL')
        .andWhere('comment.id != :cursorId', { cursorId: cursorRoot.id })
        .andWhere(
          `(comment.createdAt < :createdAt 
        OR (comment.createdAt = :createdAt AND comment.id < :id))`,
          {
            createdAt: cursorRoot.createdAt,
            id: cursorRoot.id,
          },
        )
        .orderBy('comment.createdAt', 'DESC')
        .addOrderBy('comment.id', 'DESC')
        .take(limit + 1)
        .getMany();

      return {
        hasMore: raw.length > limit,
        rows: raw.slice(0, limit),
      };
    };

    const getRootsAfter = async (cursorRoot: ForumComment, limit: number) => {
      const raw = await this.buildCommentsBaseQb(userId)
        .andWhere('comment.topicId = :topicId', { topicId: cursorRoot.topicId })
        .andWhere('comment.parentCommentId IS NULL')
        .andWhere('comment.id != :cursorId', { cursorId: cursorRoot.id })
        .andWhere(
          `(comment.createdAt > :createdAt 
        OR (comment.createdAt = :createdAt AND comment.id > :id))`,
          {
            createdAt: cursorRoot.createdAt,
            id: cursorRoot.id,
          },
        )
        .orderBy('comment.createdAt', 'ASC')
        .addOrderBy('comment.id', 'ASC')
        .take(limit + 1)
        .getMany();

      return {
        hasMore: raw.length > limit,
        rows: raw.slice(0, limit),
      };
    };

    const getRootTailBlockBefore = async (
      currentRoot: ForumComment,
      limit: number,
    ) => {
      const repliesRaw = await this.buildCommentsBaseQb(userId)
        .andWhere('comment.parentCommentId = :parentId', {
          parentId: currentRoot.id,
        })
        .orderBy('comment.createdAt', 'DESC')
        .addOrderBy('comment.id', 'DESC')
        .take(limit + 1)
        .getMany();

      const hasMoreRepliesBefore = repliesRaw.length > limit;
      const replies = repliesRaw.slice(0, limit).reverse();

      if (hasMoreRepliesBefore || replies.length >= limit) {
        ensureAnchorRoot(currentRoot);

        repliesPaginationByParentId[currentRoot.id] = {
          beforeCursor: replies.length
            ? this.encodeCommentCursor(replies[0])
            : null,
          afterCursor: null,
          hasMoreBefore: true,
          hasMoreAfter: false,
        };

        return replies;
      }

      repliesPaginationByParentId[currentRoot.id] = {
        beforeCursor: null,
        afterCursor: null,
        hasMoreBefore: false,
        hasMoreAfter: false,
      };

      return [currentRoot, ...replies];
    };

    const getRootHeadBlockAfter = async (
      currentRoot: ForumComment,
      limit: number,
    ) => {
      const block: ForumComment[] = [currentRoot];

      if (limit <= 1) {
        repliesPaginationByParentId[currentRoot.id] = {
          beforeCursor: null,
          afterCursor: null,
          hasMoreBefore: false,
          hasMoreAfter: true,
        };

        return block;
      }

      const repliesRaw = await this.buildCommentsBaseQb(userId)
        .andWhere('comment.parentCommentId = :parentId', {
          parentId: currentRoot.id,
        })
        .orderBy('comment.createdAt', 'ASC')
        .addOrderBy('comment.id', 'ASC')
        .take(limit)
        .getMany();

      const replies = repliesRaw.slice(0, limit - 1);
      const hasMoreRepliesAfter = repliesRaw.length > limit - 1;

      block.push(...replies);

      repliesPaginationByParentId[currentRoot.id] = {
        beforeCursor: null,
        afterCursor:
          hasMoreRepliesAfter && replies.length
            ? this.encodeCommentCursor(replies[replies.length - 1])
            : null,
        hasMoreBefore: false,
        hasMoreAfter: hasMoreRepliesAfter,
      };

      return block;
    };

    const beforeRows: ForumComment[] = [];
    const afterRows: ForumComment[] = [];

    if (target.parentCommentId) {
      const beforeReplies = await getRepliesBefore(
        root.id,
        target,
        beforeLimit,
      );

      beforeRows.push(...beforeReplies.rows);

      const afterReplies = await getRepliesAfter(root.id, target, afterLimit);

      afterRows.push(...afterReplies.rows);

      repliesPaginationByParentId[root.id] = {
        beforeCursor:
          beforeReplies.hasMore && beforeReplies.rows.length
            ? this.encodeCommentCursor(beforeReplies.rows[0])
            : null,
        afterCursor:
          afterReplies.hasMore && afterReplies.rows.length
            ? this.encodeCommentCursor(
                afterReplies.rows[afterReplies.rows.length - 1],
              )
            : null,
        hasMoreBefore: beforeReplies.hasMore,
        hasMoreAfter: afterReplies.hasMore,
      };

      if (beforeReplies.hasMore) {
        ensureAnchorRoot(rootFull);
      }

      if (!beforeReplies.hasMore && beforeRows.length < beforeLimit) {
        beforeRows.unshift(rootFull);

        let remaining = beforeLimit - beforeRows.length;
        let cursorRoot = root;

        while (remaining > 0) {
          const rootsBefore = await getRootsBefore(cursorRoot, 1);
          const prevRoot = rootsBefore.rows[0];

          if (!prevRoot) break;

          const block = await getRootTailBlockBefore(prevRoot, remaining);
          beforeRows.unshift(...block);

          remaining = beforeLimit - beforeRows.length;
          cursorRoot = prevRoot;

          if (block.length === 0) break;
        }
      }

      if (!afterReplies.hasMore && afterRows.length < afterLimit) {
        let remaining = afterLimit - afterRows.length;
        let cursorRoot = root;

        while (remaining > 0) {
          const rootsAfter = await getRootsAfter(cursorRoot, 1);
          const nextRoot = rootsAfter.rows[0];

          if (!nextRoot) break;

          const block = await getRootHeadBlockAfter(nextRoot, remaining);
          afterRows.push(...block);

          remaining = afterLimit - afterRows.length;
          cursorRoot = nextRoot;

          if (block.length === 0) break;
        }
      }
    } else {
      const afterRepliesRaw = await this.buildCommentsBaseQb(userId)
        .andWhere('comment.parentCommentId = :parentId', {
          parentId: root.id,
        })
        .orderBy('comment.createdAt', 'ASC')
        .addOrderBy('comment.id', 'ASC')
        .take(afterLimit + 1)
        .getMany();

      const hasMoreRepliesAfter = afterRepliesRaw.length > afterLimit;
      const repliesAfterRoot = afterRepliesRaw.slice(0, afterLimit);

      afterRows.push(...repliesAfterRoot);

      repliesPaginationByParentId[root.id] = {
        beforeCursor: null,
        afterCursor:
          hasMoreRepliesAfter && repliesAfterRoot.length
            ? this.encodeCommentCursor(
                repliesAfterRoot[repliesAfterRoot.length - 1],
              )
            : null,
        hasMoreBefore: false,
        hasMoreAfter: hasMoreRepliesAfter,
      };

      let remainingBefore = beforeLimit;
      let cursorRoot = root;

      while (remainingBefore > 0) {
        const rootsBefore = await getRootsBefore(cursorRoot, 1);
        const prevRoot = rootsBefore.rows[0];

        if (!prevRoot) break;

        const block = await getRootTailBlockBefore(prevRoot, remainingBefore);
        beforeRows.unshift(...block);

        remainingBefore = beforeLimit - beforeRows.length;
        cursorRoot = prevRoot;

        if (block.length === 0) break;
      }

      if (!hasMoreRepliesAfter && afterRows.length < afterLimit) {
        let remainingAfter = afterLimit - afterRows.length;
        let cursorAfterRoot = root;

        while (remainingAfter > 0) {
          const rootsAfter = await getRootsAfter(cursorAfterRoot, 1);
          const nextRoot = rootsAfter.rows[0];

          if (!nextRoot) break;

          const block = await getRootHeadBlockAfter(nextRoot, remainingAfter);
          afterRows.push(...block);

          remainingAfter = afterLimit - afterRows.length;
          cursorAfterRoot = nextRoot;

          if (block.length === 0) break;
        }
      }
    }

    const finalRows = [...beforeRows, targetFull, ...afterRows];

    const outputMap = new Map<string, ForumComment>();

    const put = (comment: ForumComment) => {
      if (!outputMap.has(comment.id)) {
        outputMap.set(comment.id, comment);
      }
    };

    for (const row of finalRows) {
      if (row.parentCommentId) {
        const anchorRoot = anchorRootsById.get(row.parentCommentId);

        if (anchorRoot && !outputMap.has(anchorRoot.id)) {
          put(anchorRoot);
        }
      }

      put(row);
    }

    const comments = Array.from(outputMap.values()).map((comment) =>
      this.mapCommentResponse(comment),
    );

    const outputRoots = Array.from(outputMap.values()).filter(
      (comment) => !comment.parentCommentId,
    );

    const firstRoot = outputRoots[0] ?? rootFull;
    const lastRoot = outputRoots[outputRoots.length - 1] ?? rootFull;

    const beforeCheck = firstRoot ? await getRootsBefore(firstRoot, 1) : null;
    const afterCheck = lastRoot ? await getRootsAfter(lastRoot, 1) : null;

    return {
      targetCommentId: target.id,
      rootCommentId: root.id,
      comments,
      rootPagination: {
        beforeCursor:
          beforeCheck?.rows.length && firstRoot
            ? this.encodeCommentCursor(firstRoot)
            : null,
        afterCursor:
          afterCheck?.rows.length && lastRoot
            ? this.encodeCommentCursor(lastRoot)
            : null,
        hasMoreBefore: Boolean(beforeCheck?.rows.length),
        hasMoreAfter: Boolean(afterCheck?.rows.length),
      },
      repliesPaginationByParentId,
    };
  }

  // async getCommentContext(params: {
  //   commentId: string;
  //   userId: number;
  //   rootAroundLimit: number;
  //   repliesAroundLimit: number;
  //   replyPreviewLimit: number;
  // }): Promise<CommentContextResponse> {
  //   const {
  //     commentId,
  //     userId,
  //     rootAroundLimit,
  //     repliesAroundLimit,
  //     replyPreviewLimit,
  //   } = params;
  //
  //   const target = await this.commentsRepo.findOne({
  //     where: {
  //       id: commentId,
  //       deletedAt: IsNull(),
  //     },
  //   });
  //
  //   if (!target) {
  //     throwError(
  //       HttpStatus.NOT_FOUND,
  //       'Comment not found',
  //       'Comment not found',
  //       'COMMENT_NOT_FOUND',
  //     );
  //   }
  //
  //   console.log('getCommentContext target', {
  //     commentId,
  //     targetId: target.id,
  //     targetContent: target.content,
  //     targetParentCommentId: target.parentCommentId,
  //     targetReplyToCommentId: target.replyToCommentId,
  //     targetTopicId: target.topicId,
  //   });
  //
  //   const rootCommentId = target.parentCommentId ?? target.id;
  //
  //   const root = await this.commentsRepo.findOne({
  //     where: {
  //       id: rootCommentId,
  //       deletedAt: IsNull(),
  //     },
  //   });
  //
  //   console.log('getCommentContext root', {
  //     rootCommentId,
  //     rootId: root?.id,
  //     rootContent: root?.content,
  //     rootParentCommentId: root?.parentCommentId,
  //     rootTopicId: root?.topicId,
  //     rootCreatedAt: root?.createdAt,
  //   });
  //
  //   if (!root) {
  //     throwError(
  //       HttpStatus.NOT_FOUND,
  //       'Root comment not found',
  //       'Root comment not found',
  //       'ROOT_COMMENT_NOT_FOUND',
  //     );
  //   }
  //
  //   const rootsBeforeRaw = await this.buildCommentsBaseQb(userId)
  //     .andWhere('comment.topicId = :topicId', { topicId: root.topicId })
  //     .andWhere('comment.parentCommentId IS NULL')
  //     .andWhere('comment.id != :rootId', { rootId: root.id })
  //     .andWhere(
  //       `(comment.createdAt < :createdAt
  //       OR (comment.createdAt = :createdAt AND comment.id < :id))`,
  //       {
  //         createdAt: root.createdAt,
  //         id: root.id,
  //       },
  //     )
  //     .orderBy('comment.createdAt', 'DESC')
  //     .addOrderBy('comment.id', 'DESC')
  //     .take(rootAroundLimit + 1)
  //     .getMany();
  //
  //   const hasMoreBeforeRoots = rootsBeforeRaw.length > rootAroundLimit;
  //   const rootsBefore = rootsBeforeRaw.slice(0, rootAroundLimit).reverse();
  //
  //   const rootFull = await this.buildCommentsBaseQb(userId)
  //     .andWhere('comment.id = :rootId', { rootId: root.id })
  //     .getOne();
  //
  //   if (!rootFull) {
  //     throwError(
  //       HttpStatus.NOT_FOUND,
  //       'Root comment not found',
  //       'Root comment not found',
  //       'ROOT_COMMENT_NOT_FOUND',
  //     );
  //   }
  //
  //   const rootsAfterRaw = await this.buildCommentsBaseQb(userId)
  //     .andWhere('comment.topicId = :topicId', { topicId: root.topicId })
  //     .andWhere('comment.parentCommentId IS NULL')
  //     .andWhere('comment.id != :rootId', { rootId: root.id })
  //     .andWhere(
  //       `(comment.createdAt > :createdAt
  //   OR (comment.createdAt = :createdAt AND comment.id > :id))`,
  //       {
  //         createdAt: root.createdAt,
  //         id: root.id,
  //       },
  //     )
  //     .orderBy('comment.createdAt', 'ASC')
  //     .addOrderBy('comment.id', 'ASC')
  //     .take(rootAroundLimit + 1)
  //     .getMany();
  //
  //   const hasMoreAfterRoots = rootsAfterRaw.length > rootAroundLimit;
  //   const rootsAfter = rootsAfterRaw.slice(0, rootAroundLimit);
  //
  //   console.log(
  //     'rootsBeforeRaw',
  //     rootsBeforeRaw.map((r) => ({
  //       id: r.id,
  //       content: r.content,
  //     })),
  //   );
  //
  //   console.log(
  //     'rootsAfterRaw',
  //     rootsAfterRaw.map((r) => ({
  //       id: r.id,
  //       content: r.content,
  //     })),
  //   );
  //
  //   const rootsWindow = [...rootsBefore, rootFull, ...rootsAfter];
  //
  //   const comments: ForumCommentResponse[] = [];
  //   const repliesPaginationByParentId: Record<
  //     string,
  //     CommentContextPaginationDto
  //   > = {};
  //
  //   for (const currentRoot of rootsWindow) {
  //     comments.push(this.mapCommentResponse(currentRoot));
  //
  //     if (currentRoot.id === root.id && target.parentCommentId) {
  //       const repliesBeforeRaw = await this.buildCommentsBaseQb(userId)
  //         .andWhere('comment.topicId = :topicId', {
  //           topicId: currentRoot.topicId,
  //         })
  //         .andWhere('comment.parentCommentId = :parentId', {
  //           parentId: currentRoot.id,
  //         })
  //         .andWhere('comment.id != :targetId', { targetId: target.id })
  //         .andWhere(
  //           `(comment.createdAt < :createdAt
  //           OR (comment.createdAt = :createdAt AND comment.id < :id))`,
  //           {
  //             createdAt: target.createdAt,
  //             id: target.id,
  //           },
  //         )
  //         .orderBy('comment.createdAt', 'DESC')
  //         .addOrderBy('comment.id', 'DESC')
  //         .take(repliesAroundLimit + 1)
  //         .getMany();
  //
  //       const hasMoreBeforeReplies =
  //         repliesBeforeRaw.length > repliesAroundLimit;
  //
  //       const repliesBefore = repliesBeforeRaw
  //         .slice(0, repliesAroundLimit)
  //         .reverse();
  //
  //       const targetFull = await this.buildCommentsBaseQb(userId)
  //         .andWhere('comment.id = :targetId', { targetId: target.id })
  //         .getOne();
  //
  //       if (!targetFull) {
  //         throwError(
  //           HttpStatus.NOT_FOUND,
  //           'Comment not found',
  //           'Comment not found',
  //           'COMMENT_NOT_FOUND',
  //         );
  //       }
  //
  //       const repliesAfterRaw = await this.buildCommentsBaseQb(userId)
  //         .andWhere('comment.topicId = :topicId', {
  //           topicId: currentRoot.topicId,
  //         })
  //         .andWhere('comment.parentCommentId = :parentId', {
  //           parentId: currentRoot.id,
  //         })
  //         .andWhere('comment.id != :targetId', { targetId: target.id })
  //         .andWhere(
  //           `(comment.createdAt > :createdAt
  //           OR (comment.createdAt = :createdAt AND comment.id > :id))`,
  //           {
  //             createdAt: target.createdAt,
  //             id: target.id,
  //           },
  //         )
  //         .orderBy('comment.createdAt', 'ASC')
  //         .addOrderBy('comment.id', 'ASC')
  //         .take(repliesAroundLimit + 1)
  //         .getMany();
  //
  //       const hasMoreAfterReplies = repliesAfterRaw.length > repliesAroundLimit;
  //       const repliesAfter = repliesAfterRaw.slice(0, repliesAroundLimit);
  //
  //       const replyWindow = [...repliesBefore, targetFull, ...repliesAfter];
  //
  //       comments.push(...replyWindow.map((c) => this.mapCommentResponse(c)));
  //
  //       repliesPaginationByParentId[currentRoot.id] = {
  //         beforeCursor:
  //           hasMoreBeforeReplies && repliesBefore.length
  //             ? this.encodeCommentCursor(repliesBefore[0])
  //             : null,
  //         afterCursor:
  //           hasMoreAfterReplies && repliesAfter.length
  //             ? this.encodeCommentCursor(repliesAfter[repliesAfter.length - 1])
  //             : null,
  //         hasMoreBefore: hasMoreBeforeReplies,
  //         hasMoreAfter: hasMoreAfterReplies,
  //       };
  //     } else {
  //       const repliesRaw = await this.buildCommentsBaseQb(userId)
  //         .andWhere('comment.topicId = :topicId', {
  //           topicId: currentRoot.topicId,
  //         })
  //         .andWhere('comment.parentCommentId = :parentId', {
  //           parentId: currentRoot.id,
  //         })
  //         .orderBy('comment.createdAt', 'ASC')
  //         .addOrderBy('comment.id', 'ASC')
  //         .take(replyPreviewLimit + 1)
  //         .getMany();
  //
  //       const hasMoreReplies = repliesRaw.length > replyPreviewLimit;
  //       const replies = repliesRaw.slice(0, replyPreviewLimit);
  //
  //       comments.push(...replies.map((c) => this.mapCommentResponse(c)));
  //
  //       repliesPaginationByParentId[currentRoot.id] = {
  //         beforeCursor: null,
  //         afterCursor:
  //           hasMoreReplies && replies.length
  //             ? this.encodeCommentCursor(replies[replies.length - 1])
  //             : null,
  //         hasMoreBefore: false,
  //         hasMoreAfter: hasMoreReplies,
  //       };
  //     }
  //   }
  //
  //   console.log('getCommentContext result', {
  //     targetId: target.id,
  //     rootId: root?.id,
  //     rootsWindow: rootsWindow.map((r) => ({
  //       id: r.id,
  //       content: r.content,
  //       createdAt: r.createdAt,
  //     })),
  //     comments: comments.map((c) => ({
  //       id: c.id,
  //       content: c.content,
  //       parentCommentId: c.parentCommentId,
  //     })),
  //     rootPagination: {
  //       beforeCursor:
  //         hasMoreBeforeRoots && rootsBefore.length
  //           ? this.encodeCommentCursor(rootsBefore[0])
  //           : null,
  //       afterCursor:
  //         hasMoreAfterRoots && rootsAfter.length
  //           ? this.encodeCommentCursor(rootsAfter[rootsAfter.length - 1])
  //           : null,
  //       hasMoreBefore: hasMoreBeforeRoots,
  //       hasMoreAfter: hasMoreAfterRoots,
  //     },
  //   });
  //
  //   return {
  //     targetCommentId: target.id,
  //     rootCommentId: root.id,
  //     comments,
  //     rootPagination: {
  //       beforeCursor:
  //         hasMoreBeforeRoots && rootsBefore.length
  //           ? this.encodeCommentCursor(rootsBefore[0])
  //           : null,
  //       afterCursor:
  //         hasMoreAfterRoots && rootsAfter.length
  //           ? this.encodeCommentCursor(rootsAfter[rootsAfter.length - 1])
  //           : null,
  //       hasMoreBefore: hasMoreBeforeRoots,
  //       hasMoreAfter: hasMoreAfterRoots,
  //     },
  //     repliesPaginationByParentId,
  //   };
  // }

  async getRepliesBeforePage(params: {
    parentId: string;
    userId: number;
    cursor?: string | null;
    limit: number;
  }): Promise<{
    comments: ForumCommentResponse[];
    beforeCursor: string | null;
    hasMoreBefore: boolean;
  }> {
    const { parentId, userId, cursor, limit } = params;

    const decodedCursor = this.decodeCommentCursor(cursor);

    if (!decodedCursor) {
      return {
        comments: [],
        beforeCursor: null,
        hasMoreBefore: false,
      };
    }

    const rowsRaw = await this.buildCommentsBaseQb(userId)
      .andWhere('comment.parentCommentId = :parentId', { parentId })
      .andWhere(
        `(comment.createdAt < :cursorCreatedAt 
        OR (comment.createdAt = :cursorCreatedAt AND comment.id < :cursorId))`,
        {
          cursorCreatedAt: new Date(decodedCursor.createdAt),
          cursorId: decodedCursor.id,
        },
      )
      .orderBy('comment.createdAt', 'DESC')
      .addOrderBy('comment.id', 'DESC')
      .take(limit + 1)
      .getMany();

    const hasMoreBefore = rowsRaw.length > limit;

    const rows = rowsRaw.slice(0, limit).reverse();

    return {
      comments: rows.map((comment) => this.mapCommentResponse(comment)),
      beforeCursor:
        hasMoreBefore && rows.length ? this.encodeCommentCursor(rows[0]) : null,
      hasMoreBefore,
    };
  }

  async getRootCommentsBeforePage(params: {
    topicId: string;
    userId: number;
    cursor?: string | null;
    rootLimit: number;
    replyPreviewLimit: number;
  }): Promise<{
    comments: ForumCommentResponse[];
    beforeCursor: string | null;
    hasMoreBefore: boolean;
    repliesPaginationByParentId: Record<
      string,
      {
        cursor: string | null;
        hasMore: boolean;
        beforeCursor: string | null;
        hasMoreBefore: boolean;
      }
    >;
  }> {
    const { topicId, userId, cursor, rootLimit, replyPreviewLimit } = params;

    const decodedCursor = this.decodeCommentCursor(cursor);

    if (!decodedCursor) {
      return {
        comments: [],
        beforeCursor: null,
        hasMoreBefore: false,
        repliesPaginationByParentId: {},
      };
    }

    const rootQb = this.buildCommentsBaseQb(userId)
      .andWhere('comment.topicId = :topicId', { topicId })
      .andWhere('comment.parentCommentId IS NULL')
      .andWhere(
        `(comment.createdAt < :cursorCreatedAt 
      OR (comment.createdAt = :cursorCreatedAt AND comment.id < :cursorId))`,
        {
          cursorCreatedAt: decodedCursor.createdAt,
          cursorId: decodedCursor.id,
        },
      )
      .orderBy('comment.createdAt', 'DESC')
      .addOrderBy('comment.id', 'DESC')
      .take(rootLimit + 1);

    const rootsRaw = await rootQb.getMany();

    const hasMoreBefore = rootsRaw.length > rootLimit;

    // ВАЖЛИВО: НЕ reverse тут.
    // rootsRaw йде від найближчого до дальшого: Root16, Root15, Root14...
    const roots = rootsRaw.slice(0, rootLimit);

    const blocks: ForumCommentResponse[][] = [];

    const repliesPaginationByParentId: Record<
      string,
      {
        cursor: string | null;
        hasMore: boolean;
        beforeCursor: string | null;
        hasMoreBefore: boolean;
      }
    > = {};

    let firstReturnedRoot: ForumComment | null = null;

    for (const root of roots) {
      firstReturnedRoot = root;

      const block: ForumCommentResponse[] = [];

      block.push(this.mapCommentResponse(root));

      const repliesRaw = await this.buildCommentsBaseQb(userId)
        .andWhere('comment.topicId = :topicId', { topicId })
        .andWhere('comment.parentCommentId = :parentId', {
          parentId: root.id,
        })
        .orderBy('comment.createdAt', 'DESC')
        .addOrderBy('comment.id', 'DESC')
        .take(replyPreviewLimit + 1)
        .getMany();

      const hasMoreRepliesBefore = repliesRaw.length > replyPreviewLimit;

      const replies = repliesRaw.slice(0, replyPreviewLimit).reverse();

      block.push(...replies.map((reply) => this.mapCommentResponse(reply)));

      repliesPaginationByParentId[root.id] = {
        beforeCursor:
          hasMoreRepliesBefore && replies.length
            ? this.encodeCommentCursor(replies[0])
            : null,
        hasMoreBefore: hasMoreRepliesBefore,
        cursor: null,
        hasMore: false,
      };

      blocks.unshift(block);

      if (hasMoreRepliesBefore) {
        break;
      }
    }

    const comments = blocks.flat();

    return {
      comments,
      beforeCursor:
        hasMoreBefore && firstReturnedRoot
          ? this.encodeCommentCursor(firstReturnedRoot)
          : null,
      hasMoreBefore,
      repliesPaginationByParentId,
    };
  }
}
