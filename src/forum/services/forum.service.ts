import { Injectable } from '@nestjs/common';
import { ForumUnreadSummaryResponse } from '../types/forum-unread-summary-response';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { ForumTopic } from '../entities/forum-topic.entity';
import { DataSource, Repository } from 'typeorm';
import { ForumTopicWatcher } from '../entities/forum-topic-watcher.entity';
import { ForumTopicReadState } from '../entities/forum-topic-read-state.entity';
import { ForumContentStatus } from '../types/forum-content-status.enum';

@Injectable()
export class ForumService {
  constructor(
    @InjectRepository(ForumTopic)
    private readonly topicsRepo: Repository<ForumTopic>,
  ) {}

  async getUnreadSummary(userId: number): Promise<ForumUnreadSummaryResponse> {
    try {
      const rows = await this.topicsRepo
        .createQueryBuilder('topic')
        .leftJoin(
          ForumTopicReadState,
          'readState',
          '"readState"."topic_id" = "topic"."id" AND "readState"."user_id" = :userId',
          { userId },
        )
        .leftJoin(
          ForumTopicWatcher,
          'watcher',
          `
      "watcher"."topic_id" = "topic"."id"
      AND "watcher"."user_id" = :userId
      AND "watcher"."is_muted" = false
    `,
          { userId },
        )
        .where('"topic"."status" = :status', {
          status: ForumContentStatus.PUBLISHED,
        })
        .andWhere('"topic"."deleted_at" IS NULL')
        .andWhere(
          `
      (
        "readState"."id" IS NULL
        OR "topic"."last_activity_at" > "readState"."last_read_at"
      )
    `,
        )
        .andWhere(
          `
      (
        "topic"."last_comment_author_id" IS NULL
        OR "topic"."last_comment_author_id" != :userId
      )
    `,
          { userId },
        )
        .select('"topic"."id"', 'topicId')
        .addSelect('"topic"."comments_count"', 'commentsCount')
        .addSelect('"readState"."id"', 'readStateId')
        .addSelect('"readState"."last_read_comment_id"', 'lastReadCommentId')
        .addSelect('"watcher"."id"', 'watcherId')
        .getRawMany<{
          topicId: string;
          commentsCount: string;
          readStateId: string | null;
          lastReadCommentId: string | null;
          watcherId: string | null;
        }>();

      const unreadTopicIds: string[] = [];
      const watchingUnreadTopicIds: string[] = [];
      const unreadCountsByTopicId: Record<string, number> = {};

      for (const row of rows) {
        unreadTopicIds.push(row.topicId);

        if (row.watcherId) {
          watchingUnreadTopicIds.push(row.topicId);
        }

        // Тимчасово: topic-level unread count = 1.
        // Потім замінимо на точну кількість unread comments.
        unreadCountsByTopicId[row.topicId] = 1;
      }

      return {
        totalUnreadCount: unreadTopicIds.length,
        watchingUnreadCount: watchingUnreadTopicIds.length,
        unreadTopicIds,
        watchingUnreadTopicIds,
        unreadCountsByTopicId,
      };
    } catch (e) {
      console.error('[getUnreadSummary error]', e);
      throw e;
    }
  }
}
