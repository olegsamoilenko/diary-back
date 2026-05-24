import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ForumTopicReadState } from '../entities/forum-topic-read-state.entity';
import { ForumTopic } from '../entities/forum-topic.entity';
import { ForumComment } from '../entities/forum-comment.entity';
import { ForumTopicWatcher } from '../entities/forum-topic-watcher.entity';
import { ForumTopicWatchType } from '../types/forum-topic-watch-type.enum';
import { ForumContentStatus } from '../types/forum-content-status.enum';
import { Repository } from 'typeorm';
import { throwError } from '../../common/utils';
import { HttpStatus } from '../../common/utils/http-status';

@Injectable()
export class ForumTopicReadStatesService {
  constructor(
    @InjectRepository(ForumTopicReadState)
    private readonly readStatesRepo: Repository<ForumTopicReadState>,

    @InjectRepository(ForumTopicWatcher)
    private readonly watchersRepo: Repository<ForumTopicWatcher>,

    @InjectRepository(ForumTopic)
    private readonly topicsRepo: Repository<ForumTopic>,

    @InjectRepository(ForumComment)
    private readonly commentsRepo: Repository<ForumComment>,
  ) {}

  async markTopicAsRead(
    userId: number,
    topicId: string,
    lastReadCommentId?: string,
  ) {
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

    if (lastReadCommentId) {
      const commentExists = await this.commentsRepo.exists({
        where: {
          id: lastReadCommentId,
          topicId,
          status: ForumContentStatus.PUBLISHED,
        },
      });

      if (!commentExists) {
        throwError(
          HttpStatus.NOT_FOUND,
          'Last read comment not found',
          'Last read comment not found',
          'LAST_READ_COMMENT_NOT_FOUND',
        );
      }
    }

    const now = new Date();

    await this.readStatesRepo.upsert(
      {
        userId,
        topicId,
        lastReadAt: now,
        lastReadCommentId: lastReadCommentId ?? topic.lastCommentId ?? null,
      },
      {
        conflictPaths: ['userId', 'topicId'],
        skipUpdateIfNoValuesChanged: true,
      },
    );

    const watcher = await this.watchersRepo.findOne({
      where: {
        userId,
        topicId,
      },
    });

    if (watcher) {
      await this.watchersRepo.update(
        {
          userId,
          topicId,
        },
        {
          lastReadAt: now,
        },
      );
    }

    return { success: true };
  }

  async markAllExistingTopicsAsReadForNewUser(userId: number) {
    const topics = await this.topicsRepo.find({
      where: {
        status: ForumContentStatus.PUBLISHED,
      },
      select: {
        id: true,
        createdAt: true,
        lastActivityAt: true,
        lastCommentId: true,
      },
    });

    if (!topics.length) {
      return { success: true };
    }

    const now = new Date();

    await this.readStatesRepo.upsert(
      topics.map((topic) => ({
        userId,
        topicId: topic.id,
        firstViewedAt: now,
        lastReadAt: topic.lastActivityAt ?? topic.createdAt ?? now,
        lastReadCommentId: topic.lastCommentId ?? null,
      })),
      {
        conflictPaths: ['userId', 'topicId'],
        skipUpdateIfNoValuesChanged: true,
      },
    );

    return { success: true };
  }

  async getTopicReadState(userId: number, topicId: string) {
    return this.readStatesRepo.findOne({
      where: {
        userId,
        topicId,
      },
    });
  }

  async getUnreadWatchedTopicsCount(userId: number) {
    const count = await this.watchersRepo
      .createQueryBuilder('w')
      .innerJoin('w.topic', 't')
      .leftJoin(
        ForumTopicReadState,
        'rs',
        'rs.user_id = w.user_id AND rs.topic_id = w.topic_id',
      )
      .where('w.user_id = :userId', { userId })
      .andWhere('w.is_muted = false')
      .andWhere('t.status = :status', {
        status: ForumContentStatus.PUBLISHED,
      })
      .andWhere(
        't.last_activity_at > COALESCE(rs.last_read_at, w.last_read_at, w.created_at)',
      )
      .getCount();

    return { count };
  }
}
