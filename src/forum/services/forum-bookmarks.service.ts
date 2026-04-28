import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ForumBookmark } from '../entities/forum-bookmark.entity';
import { ForumTopic } from '../entities/forum-topic.entity';
import { Repository } from 'typeorm';
import { ForumContentStatus } from '../types/forum-content-status.enum';

@Injectable()
export class ForumBookmarksService {
  constructor(
    @InjectRepository(ForumBookmark)
    private readonly bookmarksRepo: Repository<ForumBookmark>,

    @InjectRepository(ForumTopic)
    private readonly topicsRepo: Repository<ForumTopic>,
  ) {}

  async toggleBookmark(userId: number, topicId: string) {
    const topicExists = await this.topicsRepo.exists({
      where: {
        id: topicId,
        status: ForumContentStatus.PUBLISHED,
      },
    });

    if (!topicExists) {
      throw new NotFoundException('Topic not found');
    }

    const existing = await this.bookmarksRepo.findOne({
      where: {
        userId,
        topicId,
      },
    });

    if (existing) {
      await this.bookmarksRepo.delete(existing.id);

      return {
        active: false,
      };
    }

    await this.bookmarksRepo.save(
      this.bookmarksRepo.create({
        userId,
        topicId,
      }),
    );

    return {
      active: true,
    };
  }

  async getMyBookmarks(userId: number, page = 1, limit = 30) {
    const safeLimit = Math.min(Math.max(limit || 30, 1), 100);
    const safePage = Math.max(page || 1, 1);

    const [items, total] = await this.bookmarksRepo.findAndCount({
      where: {
        userId,
      },
      order: {
        createdAt: 'DESC',
      },
      take: safeLimit,
      skip: (safePage - 1) * safeLimit,
      relations: {
        topic: {
          category: true,
          author: true,
        },
      },
    });

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      hasMore: safePage * safeLimit < total,
    };
  }

  async isBookmarked(userId: number, topicId: string) {
    const exists = await this.bookmarksRepo.exists({
      where: {
        userId,
        topicId,
      },
    });

    return {
      active: exists,
    };
  }
}
