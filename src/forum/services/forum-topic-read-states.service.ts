import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ForumTopicReadState } from '../entities/forum-topic-read-state.entity';
import { ForumTopic } from '../entities/forum-topic.entity';
import { ForumComment } from '../entities/forum-comment.entity';
import { ForumTopicWatcher } from '../entities/forum-topic-watcher.entity';
import { ForumTopicWatchType } from '../types/forum-topic-watch-type.enum';
import { ForumContentStatus } from '../types/forum-content-status.enum';
import { Repository } from 'typeorm';

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
      throw new NotFoundException('Topic not found');
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
        throw new NotFoundException('Last read comment not found');
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

    // якщо користувач watch-ить топік — синхронізуємо watcher.lastReadAt
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
