// src/forum/services/forum-topics.service.ts

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
      throw new NotFoundException('Topic not found');
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
        watchType: ForumTopicWatchType.MANUAL,
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
        isBookmark: !!isBookmark,
        likedByMe: !!likedByMe,
      },
      comments,
    };
  }

  async createTopic(userId: number, dto: CreateForumTopicDto) {
    const title = dto.title.trim();
    const content = dto.content.trim();

    if (!title || !content) {
      throw new BadRequestException('Title and content are required');
    }

    const categoryExists = await this.categoriesRepo.exists({
      where: {
        id: dto.categoryId,
        isActive: true,
      },
    });

    if (!categoryExists) {
      throw new NotFoundException('Category not found');
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
      throw new NotFoundException('Topic not found');
    }

    if (topic.authorId !== userId) {
      throw new ForbiddenException('You cannot edit this topic');
    }

    if (topic.status !== ForumContentStatus.PUBLISHED) {
      throw new ForbiddenException('Topic cannot be edited');
    }

    if (dto.categoryId) {
      const categoryExists = await this.categoriesRepo.exists({
        where: {
          id: dto.categoryId,
          isActive: true,
        },
      });

      if (!categoryExists) {
        throw new NotFoundException('Category not found');
      }
    }

    const title = dto.title?.trim();
    const content = dto.content?.trim();

    if (dto.title !== undefined && !title) {
      throw new BadRequestException('Title cannot be empty');
    }

    if (dto.content !== undefined && !content) {
      throw new BadRequestException('Content cannot be empty');
    }

    await this.topicsRepo.update(topicId, {
      ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
      ...(dto.type !== undefined ? { type: dto.type } : {}),
      ...(title !== undefined ? { title } : {}),
      ...(content !== undefined ? { content } : {}),
      ...(dto.visibility !== undefined ? { visibility: dto.visibility } : {}),
      isEdited: true,
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
      throw new NotFoundException('Topic not found');
    }

    if (topic.authorId !== userId) {
      throw new ForbiddenException('You cannot delete this topic');
    }

    await this.topicsRepo.update(topicId, {
      status: ForumContentStatus.REMOVED,
      deletedAt: new Date(),
    });

    return { success: true };
  }
}
