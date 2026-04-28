// src/forum/services/forum-topic-watchers.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ForumTopicWatcher } from '../entities/forum-topic-watcher.entity';
import { ForumTopic } from '../entities/forum-topic.entity';
import { Repository } from 'typeorm';
import { ForumTopicWatchType } from '../types/forum-topic-watch-type.enum';
import { ForumContentStatus } from '../types/forum-content-status.enum';

@Injectable()
export class ForumTopicWatchersService {
  constructor(
    @InjectRepository(ForumTopicWatcher)
    private readonly watchersRepo: Repository<ForumTopicWatcher>,

    @InjectRepository(ForumTopic)
    private readonly topicsRepo: Repository<ForumTopic>,
  ) {}

  async watchTopic(
    userId: number,
    topicId: string,
    watchType: ForumTopicWatchType = ForumTopicWatchType.MANUAL,
  ) {
    const topicExists = await this.topicsRepo.exists({
      where: {
        id: topicId,
        status: ForumContentStatus.PUBLISHED,
      },
    });

    if (!topicExists) {
      throw new NotFoundException('Topic not found');
    }

    const result = await this.watchersRepo.upsert(
      {
        userId,
        topicId,
        watchType,
        isMuted: false,
        lastReadAt: new Date(),
      },
      {
        conflictPaths: ['userId', 'topicId'],
        skipUpdateIfNoValuesChanged: true,
      },
    );

    return {
      success: true,
      generatedMaps: result.generatedMaps,
    };
  }

  async unwatchTopic(userId: number, topicId: string) {
    await this.watchersRepo.delete({
      userId,
      topicId,
    });

    return { success: true };
  }

  async muteTopic(userId: number, topicId: string, isMuted: boolean) {
    await this.watchersRepo.update(
      {
        userId,
        topicId,
      },
      {
        isMuted,
      },
    );

    return { success: true };
  }

  async markTopicAsRead(userId: number, topicId: string) {
    await this.watchersRepo.upsert(
      {
        userId,
        topicId,
        watchType: ForumTopicWatchType.MANUAL,
        lastReadAt: new Date(),
      },
      {
        conflictPaths: ['userId', 'topicId'],
        skipUpdateIfNoValuesChanged: true,
      },
    );

    return { success: true };
  }

  async getUnreadWatchedTopicsCount(userId: number) {
    const result = await this.watchersRepo
      .createQueryBuilder('w')
      .innerJoin('w.topic', 't')
      .where('w.user_id = :userId', { userId })
      .andWhere('w.is_muted = false')
      .andWhere('t.status = :status', { status: ForumContentStatus.PUBLISHED })
      .andWhere('t.last_activity_at > COALESCE(w.last_read_at, w.created_at)')
      .getCount();

    return { count: result };
  }
}
