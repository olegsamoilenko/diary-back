import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { ForumTopic } from '../entities/forum-topic.entity';
import { ForumComment } from '../entities/forum-comment.entity';
import { GetAdminForumTopicsDto } from '../dto/admin/get-admin-forum-topics.dto';
import { GetAdminTopicCommentsDto } from '../dto/admin/get-admin-topic-comments.dto';
import { User } from '../../users/entities/user.entity';
import { ForumModerationLog } from '../entities/forum-moderation-log.entity';
import { GetAdminUserModerationLogsDto } from '../dto/admin/get-admin-user-moderation-logs';
import { ForumModerationTargetType } from '../types/forum-moderation-target-type.enum';
import { ForumPublicProfile } from '../entities/forum-public-profile.entity';
import { throwError } from '../../common/utils';
import { HttpStatus } from '../../common/utils/http-status';
import { CreateForumCommentDto } from '../dto/create-forum-comment.dto';
import { ForumContentStatus } from '../types/forum-content-status.enum';
import { sendForumFeedTelegram } from '../../telegram/send-telegram';
import { ForumTopicWatcher } from '../entities/forum-topic-watcher.entity';
import { ForumTopicWatchType } from '../types/forum-topic-watch-type.enum';
import { CreateAdminForumCommentDto } from '../dto/admin/create-admin-forum-comment.dto';
import { ForumCommentsService } from './forum-comments.service';
import { Role } from '../../users/types';
import { CreateSystemTopicsDto } from '../dto/admin/create-system-topics.dto';
import { ForumTopicVisibility } from '../types/forum-topic-visibility.enum';
import { ForumCategory } from '../entities/forum-category.entity';
import { formatForumCommentActionTelegram } from '../utils/telegram-feed-formatter';
import { ForumTopicTranslation } from '../entities/forum-topic-translation.entity';

@Injectable()
export class AdminForumService {
  constructor(
    private readonly dataSource: DataSource,

    @InjectRepository(ForumTopic)
    private readonly topicsRepo: Repository<ForumTopic>,

    @InjectRepository(ForumCategory)
    private readonly forumCategoryRepo: Repository<ForumCategory>,

    @InjectRepository(ForumComment)
    private readonly commentsRepo: Repository<ForumComment>,

    @InjectRepository(ForumModerationLog)
    private readonly moderationLogsRepo: Repository<ForumModerationLog>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    private readonly commentsService: ForumCommentsService,

    @InjectRepository(ForumPublicProfile)
    private readonly forumPublicProfileRepo: Repository<ForumPublicProfile>,
  ) {}

  async getTopics(dto: GetAdminForumTopicsDto) {
    const page = Math.max(dto.page || 1, 1);
    const limit = Math.min(Math.max(dto.limit || 20, 1), 100);
    const sort = dto.sort || 'lastActivityAt';

    const orderColumn =
      sort === 'createdAt' ? 'topic.createdAt' : 'topic.lastActivityAt';

    const qb = this.topicsRepo
      .createQueryBuilder('topic')
      .leftJoinAndSelect('topic.category', 'category')
      .leftJoinAndSelect('topic.translations', 'translations')
      .leftJoinAndMapOne(
        'topic.authorProfile',
        'forum_public_profiles',
        'authorProfile',
        `"authorProfile"."user_id" = "topic"."author_id"`,
      )
      .leftJoinAndSelect('topic.author', 'author')
      .leftJoinAndSelect('author.settings', 'authorSettings')
      .orderBy(orderColumn, 'DESC')
      .addOrderBy('topic.createdAt', 'DESC')
      .take(limit)
      .skip((page - 1) * limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      pageCount: Math.ceil(total / limit),
      sort,
      hasMore: page * limit < total,
    };
  }

  async getTopicComments(topicId: string, dto: GetAdminTopicCommentsDto) {
    const topicExists = await this.topicsRepo.exists({
      where: {
        id: topicId,
      },
    });

    if (!topicExists) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Topic not found',
        'Topic not found',
        'TOPIC_NOT_FOUND',
      );
    }

    const take = dto.take ?? 'all';
    const isLimitedLatest = take !== 'all';

    const page = Math.max(dto.page || 1, 1);

    const limit = isLimitedLatest
      ? Number(take)
      : Math.min(Math.max(dto.limit || 20, 1), 20);

    const rootRowsQb = this.commentsRepo
      .createQueryBuilder('root')
      .select('root.id', 'id')
      .where('root.topic_id = :topicId', { topicId })
      .andWhere('root.parent_comment_id IS NULL')
      .andWhere('root.deleted_at IS NULL')
      .orderBy('root.created_at', 'ASC')
      .limit(limit);

    if (!isLimitedLatest) {
      rootRowsQb.offset((page - 1) * limit);
    }

    const rootRows = await rootRowsQb.getRawMany<{
      id: string;
    }>();

    const rootIds = rootRows.map((row) => row.id);

    const totalRootComments = await this.commentsRepo.count({
      where: {
        topicId,
        parentCommentId: IsNull(),
        deletedAt: IsNull(),
      },
    });

    if (!rootIds.length) {
      return {
        items: [],
        total: totalRootComments,
        page,
        limit,
        pageCount: Math.ceil(totalRootComments / limit),
        take,
        hasMore: false,
      };
    }

    const selectedComments = await this.commentsRepo
      .createQueryBuilder('comment')
      .leftJoinAndMapOne(
        'comment.authorProfile',
        'forum_public_profiles',
        'authorProfile',
        `"authorProfile"."user_id" = "comment"."author_id"`,
      )
      .leftJoinAndSelect('comment.parentComment', 'parentComment')
      .leftJoinAndSelect('comment.replyToComment', 'replyToComment')
      .leftJoinAndSelect('comment.author', 'author')
      .leftJoinAndSelect('author.settings', 'authorSettings')
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
      .where('comment.topic_id = :topicId', { topicId })
      .andWhere('comment.deleted_at IS NULL')
      .andWhere(
        `
      (
        comment.id IN (:...rootIds)
        OR comment.parent_comment_id IN (:...rootIds)
      )
      `,
        { rootIds },
      )
      .orderBy('comment.created_at', 'ASC')
      .getMany();

    const commentsById = new Map(
      selectedComments.map((comment) => [comment.id, comment]),
    );

    const repliesByParentId = new Map<string, ForumComment[]>();

    for (const comment of selectedComments) {
      if (!comment.parentCommentId) continue;

      const list = repliesByParentId.get(comment.parentCommentId) ?? [];
      list.push(comment);
      repliesByParentId.set(comment.parentCommentId, list);
    }

    const rootComments = rootIds
      .map((id) => commentsById.get(id))
      .filter(Boolean) as ForumComment[];

    const items = rootComments.map((root) => ({
      ...root,
      replies: repliesByParentId.get(root.id) ?? [],
    }));

    return {
      items,
      total: totalRootComments,
      page,
      limit,
      pageCount: Math.ceil(totalRootComments / limit),
      hasMore: isLimitedLatest ? false : page * limit < totalRootComments,
    };
  }

  async getUserModerationLogs(
    userId: number,
    dto: GetAdminUserModerationLogsDto,
  ) {
    const page = Math.max(dto.page || 1, 1);
    const limit = Math.min(Math.max(dto.limit || 50, 1), 200);

    const [items, total] = await this.moderationLogsRepo.findAndCount({
      where: {
        targetUserId: userId,
      },
      order: {
        createdAt: 'ASC',
      },
      take: limit,
      skip: (page - 1) * limit,
      relations: {
        moderator: true,
        targetUser: true,
      },
    });

    return {
      items,
      total,
      page,
      limit,
      pageCount: Math.ceil(total / limit),
      hasMore: page * limit < total,
    };
  }

  async getModerationTarget(
    targetType: ForumModerationTargetType,
    targetId: string,
  ) {
    if (targetType === ForumModerationTargetType.TOPIC) {
      const topic = await this.topicsRepo
        .createQueryBuilder('topic')
        .leftJoinAndSelect('topic.category', 'category')
        .leftJoinAndSelect('topic.author', 'author')
        .leftJoinAndSelect('author.settings', 'authorSettings')
        .leftJoinAndMapOne(
          'topic.authorProfile',
          ForumPublicProfile,
          'authorProfile',
          'authorProfile.userId = topic.authorId',
        )
        .where('topic.id = :targetId', { targetId })
        .getOne();

      if (!topic) {
        throwError(
          HttpStatus.NOT_FOUND,
          'Topic not found',
          'Topic not found',
          'TOPIC_NOT_FOUND',
        );
      }

      return {
        targetType,
        item: topic,
      };
    }

    if (targetType === ForumModerationTargetType.COMMENT) {
      const comment = await this.commentsRepo
        .createQueryBuilder('comment')
        .leftJoinAndSelect('comment.author', 'author')
        .leftJoinAndSelect('author.settings', 'authorSettings')
        .leftJoinAndMapOne(
          'comment.authorProfile',
          ForumPublicProfile,
          'authorProfile',
          'authorProfile.userId = comment.authorId',
        )
        .where('comment.id = :targetId', { targetId })
        .getOne();

      if (!comment) {
        throwError(
          HttpStatus.NOT_FOUND,
          'Comment not found',
          'Comment not found',
          'COMMENT_NOT_FOUND',
        );
      }

      return {
        targetType,
        item: comment,
      };
    }

    throwError(
      HttpStatus.BAD_REQUEST,
      'Unsupported moderation target type',
      'Unsupported moderation target type',
      'UNSUPPORTED_MODERATION_TARGET_TYPE',
    );
  }

  async createComment(topicId: string, dto: CreateAdminForumCommentDto) {
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

      if (topic.isLocked) {
        throwError(
          HttpStatus.FORBIDDEN,
          'Topic is locked',
          'Topic is locked',
          'TOPIC_IS_LOCKED',
        );
      }

      const authorPublicProfile = await this.forumPublicProfileRepo.findOne({
        where: { userId: dto.userId },
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

        parentCommentId = replyTarget?.parentCommentId
          ? replyTarget.parentCommentId
          : replyTarget!.id;

        replyToCommentId = replyTarget?.parentCommentId ? replyTarget.id : null;
      } else if (dto.parentCommentId) {
        const parentComment = await commentRepo.findOne({
          where: {
            id: dto.parentCommentId,
            topicId,
          },
          withDeleted: true,
        });

        parentCommentId = parentComment?.parentCommentId
          ? parentComment.parentCommentId
          : parentComment!.id;

        replyToCommentId = null;
      }

      const comment = commentRepo.create({
        topicId,
        authorId: dto.userId,
        parentCommentId,
        replyToCommentId,
        content,
        status: ForumContentStatus.PUBLISHED,
      });

      const savedComment = await commentRepo.save(comment);

      await this.commentsService.sendNewCommentPushNotifications({
        manager,
        topicId,
        commentId: savedComment.id,
        actorId: dto.userId,
        authorName: authorNickname,
        topicTitle: topic.title,
      });

      await sendForumFeedTelegram(
        formatForumCommentActionTelegram({
          actionType: 'new',
          content,
          commentId: savedComment.id,
          topicId,
          authorId: dto.userId,
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

      const now = new Date();

      await topicRepo.update(topicId, {
        commentsCount: () => '"comments_count" + 1',
        lastActivityAt: now,
        lastCommentAuthorId: dto.userId,
        lastCommentId: savedComment.id,
      });

      return savedCommentWithAuthorProfile;
    });
  }

  async editComment(
    commentId: string,
    dto: { userId: number; content: string },
  ) {
    const content = dto.content?.trim();

    if (!content) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Comment content is required',
        'Comment content is required',
        'COMMENT_CONTENT_IS_REQUIRED',
      );
    }

    const author = await this.userRepo.findOne({
      where: { id: dto.userId },
      select: { id: true },
    });

    if (!author) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User not found',
        'USER_NOT_FOUND',
      );
      return;
    }

    const comment = await this.commentsRepo.findOne({
      where: { id: commentId },
      withDeleted: true,
    });

    if (!comment) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Comment not found',
        'Comment not found',
        'COMMENT_NOT_FOUND',
      );
      return;
    }

    if (comment.deletedAt) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Comment is deleted',
        'Deleted comment cannot be updated',
        'COMMENT_IS_DELETED',
      );
      return;
    }

    comment.authorId = dto.userId;
    comment.content = content;
    comment.isEdited = true;
    comment.editedAt = new Date();
    comment.updatedAt = new Date();

    await this.commentsRepo.save(comment);

    return this.commentsRepo
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.author', 'author')
      .leftJoinAndSelect('author.settings', 'authorSettings')
      .leftJoinAndSelect('comment.parentComment', 'parentComment')
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
      .where('comment.id = :commentId', { commentId })
      .getOne();
  }

  async getUserByRole(role: Role): Promise<User | null> {
    return await this.userRepo.findOne({
      where: { role },
    });
  }

  async getCommentLocationInTopic(
    topicId: string,
    commentId: string,
    limit = 20,
  ) {
    const comment = await this.commentsRepo.findOne({
      where: {
        id: commentId,
        topicId,
      },
      withDeleted: true,
      select: {
        id: true,
        topicId: true,
        parentCommentId: true,
        createdAt: true,
      },
    });

    if (!comment) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Comment not found in this topic',
        'Comment not found in this topic',
        'COMMENT_NOT_FOUND_IN_TOPIC',
      );
    }

    const rootCommentId = comment.parentCommentId ?? comment.id;

    const rootComment =
      rootCommentId === comment.id
        ? comment
        : await this.commentsRepo.findOne({
            where: {
              id: rootCommentId,
              topicId,
            },
            withDeleted: true,
            select: {
              id: true,
              topicId: true,
              createdAt: true,
            },
          });

    if (!rootComment) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Root comment not found in this topic',
        'Root comment not found in this topic',
        'ROOT_COMMENT_NOT_FOUND_IN_TOPIC',
      );
    }

    const rootsBefore = await this.commentsRepo
      .createQueryBuilder('comment')
      .withDeleted()
      .where('comment.topicId = :topicId', { topicId })
      .andWhere('comment.parentCommentId IS NULL')
      .andWhere('comment.createdAt < :createdAt', {
        createdAt: rootComment.createdAt,
      })
      .getCount();

    const page = Math.floor(rootsBefore / limit) + 1;

    return {
      topicId,
      commentId,
      rootCommentId,
      page,
      limit,
    };
  }

  async createSystemTopicWithTranslations(dto: CreateSystemTopicsDto) {
    const { userId, type, categorySlug, topics } = dto;

    if (!topics?.length) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Topics are required',
        'At least one topic is required.',
        'SYSTEM_TOPICS_REQUIRED',
      );
    }

    const category = await this.forumCategoryRepo.findOne({
      where: { slug: categorySlug },
    });

    if (!category) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Forum category not found',
        'Forum category not found.',
        'FORUM_CATEGORY_NOT_FOUND',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const topicsRepo = manager.getRepository(ForumTopic);
      const translationsRepo = manager.getRepository(ForumTopicTranslation);

      const now = new Date();
      const [mainTopic, ...translations] = topics;

      const savedTopic = await topicsRepo.save(
        topicsRepo.create({
          authorId: userId,
          categoryId: category.id,
          type,
          lang: mainTopic.lang,
          title: mainTopic.title,
          content: mainTopic.content,
          isSystem: true,
          status: ForumContentStatus.PUBLISHED,
          visibility: ForumTopicVisibility.PUBLIC,
          commentsCount: 0,
          reactionsCount: 0,
          likesCount: 0,
          reportsCount: 0,
          viewsCount: 0,
          watchersCount: 1,
          lastActivityAt: now,
          lastCommentId: null,
          lastCommentAuthorId: null,
          isPinned: false,
          isLocked: false,
          isFeatured: false,
        }),
      );

      if (translations.length) {
        await translationsRepo.save(
          translations
            .filter((translation) => translation.lang !== mainTopic.lang)
            .map((translation) =>
              translationsRepo.create({
                topicId: savedTopic.id,
                lang: translation.lang,
                title: translation.title,
                content: translation.content,
              }),
            ),
        );
      }

      return savedTopic;
    });
  }

  async updateSystemTopic(topicId: string, dto: CreateSystemTopicsDto) {
    return this.dataSource.transaction(async (manager) => {
      const topicsRepo = manager.getRepository(ForumTopic);
      const categoriesRepo = manager.getRepository(ForumCategory);
      const translationsRepo = manager.getRepository(ForumTopicTranslation);

      const topic = await topicsRepo.findOne({
        where: { id: topicId },
        relations: {
          translations: true,
        },
      });

      if (!topic) {
        throwError(
          HttpStatus.NOT_FOUND,
          'Topic not found',
          'Topic not found',
          'TOPIC_NOT_FOUND',
        );
        return;
      }

      if (!topic.isSystem) {
        throwError(
          HttpStatus.BAD_REQUEST,
          'Topic is not system topic',
          'Only system topics can be updated here',
          'TOPIC_IS_NOT_SYSTEM',
        );
        return;
      }

      const category = await categoriesRepo.findOne({
        where: { slug: dto.categorySlug },
      });

      if (!category) {
        throwError(
          HttpStatus.NOT_FOUND,
          'Category not found',
          'Category not found',
          'CATEGORY_NOT_FOUND',
        );
        return;
      }

      topic.type = dto.type;
      topic.categoryId = category.id;
      topic.isEdited = true;
      topic.editedAt = new Date();
      topic.updatedAt = new Date();

      /**
       * Main topic content fallback.
       * Я б тримав EN як базову версію в forum_topics.title/content.
       */
      const fallback =
        dto.topics.find((item) => item.lang === 'en') ?? dto.topics[0];

      if (fallback) {
        topic.lang = fallback.lang;
        topic.title = fallback.title.trim();
        topic.content = fallback.content.trim();
      }

      const savedTopic = await topicsRepo.save(topic);

      for (const item of dto.topics) {
        const lang = item.lang.trim();

        const existing = await translationsRepo.findOne({
          where: {
            topicId: savedTopic.id,
            lang,
          },
        });

        if (existing) {
          existing.title = item.title.trim();
          existing.content = item.content.trim();

          await translationsRepo.save(existing);
        } else {
          await translationsRepo.save(
            translationsRepo.create({
              topicId: savedTopic.id,
              lang,
              title: item.title.trim(),
              content: item.content.trim(),
            }),
          );
        }
      }

      return topicsRepo.findOne({
        where: { id: savedTopic.id },
        relations: {
          category: true,
          translations: true,
        },
      });
    });
  }
}
