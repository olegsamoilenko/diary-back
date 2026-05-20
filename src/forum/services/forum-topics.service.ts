import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { ForumTopic } from '../entities/forum-topic.entity';
import { ForumCategory } from '../entities/forum-category.entity';
import { ForumTopicWatcher } from '../entities/forum-topic-watcher.entity';
import { CreateForumTopicDto } from '../dto/create-forum-topic.dto';
import { UpdateForumTopicDto } from '../dto/update-forum-topic.dto';
import { ForumContentStatus } from '../types/forum-content-status.enum';
import { ForumTopicVisibility } from '../types/forum-topic-visibility.enum';
import { ForumTopicWatchType } from '../types/forum-topic-watch-type.enum';
import { ForumPublicProfile } from '../entities/forum-public-profile.entity';
import { ForumCommentsService } from './forum-comments.service';
import { ForumTopicReadState } from '../entities/forum-topic-read-state.entity';
import { ForumTopicsSort } from '../types/forum-topics-sort.enum';
import { ForumShowTopics } from '../types/forum-show-topics.enum';
import { ForumBookmark } from '../entities/forum-bookmark.entity';
import { ForumReaction } from '../entities/forum-reaction.entity';
import { ForumReactionTargetType } from '../types/forum-reaction-target-type.enum';
import { ForumReactionType } from '../types/forum-reaction-type.enum';
import { User } from '../../users/entities/user.entity';
import { sendTelegram } from '../../telegram/send-telegram';
import { ForumUserRestrictionsService } from './forum-user-restrictions.service';
import { throwError } from '../../common/utils';
import { HttpStatus } from '../../common/utils/http-status';

type TopicRawRow = {
  isUnread: boolean | string | number | null;
};

@Injectable()
export class ForumTopicsService {
  constructor(
    @InjectRepository(ForumTopic)
    private readonly topicsRepo: Repository<ForumTopic>,

    @InjectRepository(ForumTopicWatcher)
    private readonly forumTopicWatcherRepo: Repository<ForumTopicWatcher>,

    @InjectRepository(ForumCategory)
    private readonly categoriesRepo: Repository<ForumCategory>,

    @InjectRepository(ForumBookmark)
    private readonly forumBookmarkRepo: Repository<ForumBookmark>,

    @InjectRepository(ForumReaction)
    private readonly forumReactionRepo: Repository<ForumReaction>,

    @InjectDataSource()
    private readonly dataSource: DataSource,

    private readonly forumCommentsService: ForumCommentsService,

    private readonly forumUserRestrictionsService: ForumUserRestrictionsService,
  ) {}

  async getTopics(params: {
    userId: number;
    categories: string[];
    sort: ForumTopicsSort;
    showTopics: ForumShowTopics;
    page?: number;
    limit?: number;
  }) {
    const safeLimit = Math.min(Math.max(params.limit || 30, 1), 100);
    const safePage = Math.max(params.page || 1, 1);

    const qb = this.topicsRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.category', 'category')
      .leftJoinAndMapOne(
        't.authorProfile',
        ForumPublicProfile,
        'authorProfile',
        'authorProfile.userId = t.authorId',
      )
      .leftJoinAndMapOne('t.author', User, 'author', 'author.id = t.authorId')
      .leftJoin(
        ForumTopicReadState,
        'readState',
        'readState.topicId = t.id AND readState.userId = :userId',
        { userId: params.userId },
      )
      .addSelect(
        `
      CASE
        WHEN readState.id IS NULL THEN true
        WHEN t.lastActivityAt > readState.lastReadAt THEN true
        ELSE false
      END
      `,
        'isUnread',
      )
      .where('t.status = :status', { status: ForumContentStatus.PUBLISHED })
      .andWhere('t.deletedAt IS NULL');

    if (params.showTopics === ForumShowTopics.WATCHING) {
      qb.andWhere((subQb) => {
        const subQuery = subQb
          .subQuery()
          .select('1')
          .from(ForumTopicWatcher, 'watcher')
          .where('watcher.topicId = t.id')
          .andWhere('watcher.userId = :userId')
          .andWhere('watcher.isMuted = false')
          .getQuery();

        return `EXISTS ${subQuery}`;
      });
    }

    if (params.showTopics === ForumShowTopics.BOOKMARKED) {
      qb.andWhere((subQb) => {
        const subQuery = subQb
          .subQuery()
          .select('1')
          .from(ForumBookmark, 'bookmark')
          .where('bookmark.topicId = t.id')
          .andWhere('bookmark.userId = :userId')
          .getQuery();

        return `EXISTS ${subQuery}`;
      });
    }

    const categories = params.categories ?? [];
    const shouldFilterByCategories =
      categories.length > 0 && !categories.includes('all');

    if (shouldFilterByCategories) {
      qb.andWhere('t.categoryId IN (:...categories)', {
        categories,
      });
    }

    qb.orderBy('t.isPinned', 'DESC');

    if (params.sort === ForumTopicsSort.DATE_CREATED) {
      qb.addOrderBy('t.createdAt', 'DESC');
    } else {
      qb.addOrderBy('t.lastActivityAt', 'DESC');
    }

    qb.take(safeLimit).skip((safePage - 1) * safeLimit);

    const total = await qb.getCount();
    const { entities, raw } = await qb.getRawAndEntities();

    const rawRows = raw as TopicRawRow[];

    const items = entities.map((topic, index) => {
      const isUnreadRaw = rawRows[index]?.isUnread;

      return {
        ...topic,
        isUnread:
          isUnreadRaw === true ||
          isUnreadRaw === 'true' ||
          isUnreadRaw === '1' ||
          isUnreadRaw === 1,
      };
    });

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      hasMore: safePage * safeLimit < total,
    };
  }

  async getTopicById(topicId: string, userId: number) {
    const topic = await this.topicsRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.category', 'category')
      .leftJoinAndSelect('t.author', 'author')
      .leftJoinAndMapOne(
        't.authorProfile',
        ForumPublicProfile,
        'authorProfile',
        'authorProfile.userId = t.authorId',
      )
      .where('t.id = :topicId', { topicId })
      .andWhere('t.status = :status', {
        status: ForumContentStatus.PUBLISHED,
      })
      .andWhere('t.deletedAt IS NULL')
      .getOne();

    if (!topic) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Topic not found',
        'Topic not found',
        'TOPIC_NOT_FOUND',
      );
    }

    const comments = await this.forumCommentsService.getTopicComments(
      topicId,
      userId,
    );

    const watcher = await this.forumTopicWatcherRepo.findOne({
      where: {
        topicId,
        userId,
        isMuted: false,
      },
    });

    const isBookmark = await this.forumBookmarkRepo.findOne({
      where: {
        topicId,
        userId,
      },
    });

    const likedByMe = await this.forumReactionRepo.findOne({
      where: {
        targetId: topicId,
        userId,
        targetType: ForumReactionTargetType.TOPIC,
        reactionType: ForumReactionType.LIKE,
      },
    });

    return {
      topic: {
        ...topic,
        isWatching: !!watcher,
        watchType: watcher?.watchType ?? null,
        isBookmark: !!isBookmark,
        likedByMe: !!likedByMe,
      },
      comments,
    };
  }

  async createTopic(userId: number, dto: CreateForumTopicDto) {
    await this.forumUserRestrictionsService.assertCanWrite(userId);

    const title = dto.title.trim();
    const content = dto.content.trim();

    if (!title || !content) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Title and content are required',
        'Title and content are required',
        'TITLE_AND_CONTENT_ARE_REQUIRED',
      );
    }

    const categoryExists = await this.categoriesRepo.exists({
      where: {
        id: dto.categoryId,
        isActive: true,
      },
    });

    if (!categoryExists) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Category not found',
        'Category not found',
        'CATEGORY_NOT_FOUND',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const topicRepo = manager.getRepository(ForumTopic);
      const watcherRepo = manager.getRepository(ForumTopicWatcher);
      const readStateRepo = manager.getRepository(ForumTopicReadState);

      const now = new Date();

      const topic = await topicRepo.save(
        topicRepo.create({
          authorId: userId,
          categoryId: dto.categoryId,
          type: dto.type,
          lang: dto.lang,
          title,
          content,
          status: ForumContentStatus.PUBLISHED,
          visibility: dto.visibility ?? ForumTopicVisibility.PUBLIC,
          commentsCount: 0,
          reactionsCount: 0,
          reportsCount: 0,
          viewsCount: 0,
          watchersCount: 1,
          lastActivityAt: now,
          lastCommentId: null,
          isPinned: false,
          isLocked: false,
          isFeatured: false,
        }),
      );

      await watcherRepo.save(
        watcherRepo.create({
          userId,
          topicId: topic.id,
          watchType: ForumTopicWatchType.AUTO_AUTHOR,
          isMuted: false,
          lastReadAt: now,
          lastNotifiedAt: null,
        }),
      );

      await readStateRepo.save(
        readStateRepo.create({
          userId,
          topicId: topic.id,
          lastReadAt: now,
          lastReadCommentId: null,
        }),
      );

      await sendTelegram(
        `TOPIC ADDED: \n title: \n ${title} \n content: \n ${content} \n topicId: ${topic.id} \n authorId: ${userId}`,
      );

      return topic;
    });
  }

  async updateTopic(userId: number, topicId: string, dto: UpdateForumTopicDto) {
    const topic = await this.topicsRepo.findOne({
      where: {
        id: topicId,
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

    if (topic.authorId !== userId) {
      throwError(
        HttpStatus.FORBIDDEN,
        'You cannot edit this topic',
        'You cannot edit this topic',
        'YOU_CANNOT_EDIT_THIS_TOPIC',
      );
    }

    if (topic.status !== ForumContentStatus.PUBLISHED) {
      throwError(
        HttpStatus.FORBIDDEN,
        'Topic cannot be edited',
        'Topic cannot be edited',
        'TOPIC_CANNOT_BE_EDITED',
      );
    }

    if (dto.categoryId) {
      const categoryExists = await this.categoriesRepo.exists({
        where: {
          id: dto.categoryId,
          isActive: true,
        },
      });

      if (!categoryExists) {
        throwError(
          HttpStatus.NOT_FOUND,
          'Category not found',
          'Category not found',
          'CATEGORY_NOT_FOUND',
        );
      }
    }

    const title = dto.title?.trim();
    const content = dto.content?.trim();

    if (dto.title !== undefined && !title) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Title cannot be empty',
        'Title cannot be empty',
        'TITLE_CANNOT_BE_EMPTY',
      );
    }

    if (dto.content !== undefined && !content) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Content cannot be empty',
        'Content cannot be empty',
        'CONTENT_CANNOT_BE_EMPTY',
      );
    }

    await this.topicsRepo.update(topicId, {
      ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
      ...(dto.type !== undefined ? { type: dto.type } : {}),
      ...(title !== undefined ? { title } : {}),
      ...(content !== undefined ? { content } : {}),
      ...(dto.visibility !== undefined ? { visibility: dto.visibility } : {}),
      isEdited: true,
      editedAt: new Date(),
    });

    return this.getTopicById(topicId, userId);
  }

  async deleteTopic(userId: number, topicId: string) {
    const topic = await this.topicsRepo.findOne({
      where: {
        id: topicId,
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

    if (topic.authorId !== userId) {
      throwError(
        HttpStatus.FORBIDDEN,
        'You cannot delete this topic',
        'You cannot delete this topic',
        'YOU_CANNOT_DELETE_THIS_TOPIC',
      );
    }

    await this.topicsRepo.update(topicId, {
      status: ForumContentStatus.REMOVED_BY_AUTHOR,
      deletedAt: new Date(),
    });

    return { success: true };
  }
}
