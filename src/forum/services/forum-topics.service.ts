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

@Injectable()
export class ForumTopicsService {
  constructor(
    @InjectRepository(ForumTopic)
    private readonly topicsRepo: Repository<ForumTopic>,

    @InjectRepository(ForumCategory)
    private readonly categoriesRepo: Repository<ForumCategory>,

    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getTopics(params: {
    categoryId?: string;
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
      .where('t.status = :status', { status: ForumContentStatus.PUBLISHED })
      .andWhere('t.deletedAt IS NULL');

    if (params.categoryId) {
      qb.andWhere('t.categoryId = :categoryId', {
        categoryId: params.categoryId,
      });
    }

    qb.orderBy('t.isPinned', 'DESC')
      .addOrderBy('t.lastActivityAt', 'DESC')
      .take(safeLimit)
      .skip((safePage - 1) * safeLimit);

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      hasMore: safePage * safeLimit < total,
    };
  }

  async getTopicById(topicId: string) {
    const topic = await this.topicsRepo.findOne({
      where: {
        id: topicId,
        status: ForumContentStatus.PUBLISHED,
        deletedAt: IsNull(),
      },
      relations: {
        category: true,
        author: true,
      },
    });

    if (!topic) {
      throw new NotFoundException('Topic not found');
    }

    return topic;
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
    });

    return this.getTopicById(topicId);
  }

  async deleteTopic(userId: number, topicId: string) {
    const topic = await this.topicsRepo.findOne({
      where: {
        id: topicId,
      },
    });

    if (!topic) {
      throw new NotFoundException('Topic not found');
    }

    if (topic.authorId !== userId) {
      throw new ForbiddenException('You cannot delete this topic');
    }

    await this.topicsRepo.softDelete(topicId);

    return { success: true };
  }
}
