import { Injectable, NotFoundException } from '@nestjs/common';
import { ForumUnreadSummaryResponse } from '../types/forum-unread-summary-response';
import { InjectRepository } from '@nestjs/typeorm';
import { ForumTopic } from '../entities/forum-topic.entity';
import { IsNull, Repository } from 'typeorm';
import { ForumTopicWatcher } from '../entities/forum-topic-watcher.entity';
import { ForumTopicReadState } from '../entities/forum-topic-read-state.entity';
import { ForumContentStatus } from '../types/forum-content-status.enum';
import { ForumComment } from '../entities/forum-comment.entity';
import { ForumTopicUnreadSessionResponse } from '../types/forum-topic-unread-session-response';
import { throwError } from '../../common/utils';
import { HttpStatus } from '../../common/utils/http-status';

@Injectable()
export class ForumService {
  constructor(
    @InjectRepository(ForumTopic)
    private readonly topicsRepo: Repository<ForumTopic>,
    @InjectRepository(ForumTopicReadState)
    private readonly forumTopicReadStateRepo: Repository<ForumTopicReadState>,
  ) {}

  async getUnreadSummary(userId: number): Promise<ForumUnreadSummaryResponse> {
    try {
      const rows = await this.topicsRepo
        .createQueryBuilder('topic')
        .leftJoin(
          ForumTopicReadState,
          'readState',
          `
          "readState"."topic_id" = "topic"."id"
          AND "readState"."user_id" = :userId
        `,
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
        .leftJoin(
          ForumComment,
          'comment',
          `
          "comment"."topic_id" = "topic"."id"
          AND "comment"."status" = :commentStatus
          AND "comment"."deleted_at" IS NULL
          AND "comment"."author_id" != :userId
          AND (
            "readState"."id" IS NULL
            OR "comment"."created_at" > "readState"."last_read_at"
          )
        `,
          {
            userId,
            commentStatus: ForumContentStatus.PUBLISHED,
          },
        )
        .where('"topic"."status" = :topicStatus', {
          topicStatus: ForumContentStatus.PUBLISHED,
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
        .select('"topic"."id"', 'topicId')
        .addSelect('"watcher"."id"', 'watcherId')
        .addSelect(
          `
            CASE 
              WHEN "readState"."id" IS NULL 
                OR "readState"."first_viewed_at" IS NULL 
              THEN true
              ELSE false
            END
          `,
          'isNewTopic',
        )
        .addSelect('COUNT("comment"."id")', 'unreadCommentsCount')
        .groupBy('"topic"."id"')
        .addGroupBy('"readState"."id"')
        .addGroupBy('"readState"."first_viewed_at"')
        .addGroupBy('"watcher"."id"')
        .getRawMany<{
          topicId: string;
          watcherId: string | null;
          isNewTopic: boolean | string;
          unreadCommentsCount: string;
        }>();

      const unreadTopicIds: string[] = [];
      const watchingUnreadTopicIds: string[] = [];
      const unreadCountsByTopicId: Record<string, number> = {};
      const newTopicIds: string[] = [];
      const newByTopicId: Record<string, boolean> = {};

      for (const row of rows) {
        const count = Number(row.unreadCommentsCount);
        const isNewTopic = row.isNewTopic === true || row.isNewTopic === 'true';

        const shouldIncludeTopic = isNewTopic || count > 0;

        if (!shouldIncludeTopic) {
          continue;
        }

        const isWatching = Boolean(row.watcherId);

        unreadCountsByTopicId[row.topicId] = count;
        newByTopicId[row.topicId] = isNewTopic;

        if (isNewTopic) {
          newTopicIds.push(row.topicId);
        }

        if (isWatching) {
          watchingUnreadTopicIds.push(row.topicId);
        } else {
          unreadTopicIds.push(row.topicId);
        }
      }

      return {
        totalUnreadCount: unreadTopicIds.length,
        watchingUnreadCount: watchingUnreadTopicIds.length,
        unreadTopicIds,
        watchingUnreadTopicIds,
        unreadCountsByTopicId,
        newTopicIds,
        newByTopicId,
      };
    } catch (e) {
      console.error('[getUnreadSummary error]', e);
      throw e;
    }
  }

  async getTopicUnreadSession(
    userId: number,
    topicId: string,
  ): Promise<ForumTopicUnreadSessionResponse> {
    const topic = await this.topicsRepo.findOne({
      where: {
        id: topicId,
        status: ForumContentStatus.PUBLISHED,
      },
      select: {
        id: true,
        authorId: true,
        createdAt: true,
        lastActivityAt: true,
        deletedAt: true,
      },
    });

    if (!topic || topic.deletedAt) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Topic not found',
        'Topic not found',
        'TOPIC_NOT_FOUND',
      );
    }

    const readState = await this.forumTopicReadStateRepo.findOne({
      where: {
        userId,
        topicId,
      },
      select: {
        id: true,
        lastReadAt: true,
        lastReadCommentId: true,
      },
    });

    const effectiveReadAt = readState?.lastReadAt ?? null;

    const isOwnTopic = topic.authorId === userId;

    const isTopicUnread =
      !isOwnTopic &&
      (!effectiveReadAt || topic.lastActivityAt > effectiveReadAt);

    const unreadRows = await this.topicsRepo.manager
      .getRepository(ForumComment)
      .createQueryBuilder('comment')
      .where('"comment"."topic_id" = :topicId', { topicId })
      .andWhere('"comment"."status" = :status', {
        status: ForumContentStatus.PUBLISHED,
      })
      .andWhere('"comment"."deleted_at" IS NULL')
      .andWhere('"comment"."author_id" != :userId', { userId })
      .andWhere(
        `
        (
          :effectiveReadAt::timestamptz IS NULL
          OR "comment"."created_at" > :effectiveReadAt
        )
      `,
        { effectiveReadAt },
      )
      .orderBy('"comment"."created_at"', 'ASC')
      .addOrderBy('"comment"."id"', 'ASC')
      .select('"comment"."id"', 'commentId')
      .getRawMany<{ commentId: string }>();

    const unreadCommentIds = unreadRows.map((row) => row.commentId);

    return {
      topicId,
      isTopicUnread,
      unreadCommentIds,
      firstUnreadCommentId: unreadCommentIds[0] ?? null,
      unreadCommentsCount: unreadCommentIds.length,
    };
  }

  async markTopicViewed(userId: number, topicId: string) {
    const topic = await this.topicsRepo.findOne({
      where: {
        id: topicId,
        status: ForumContentStatus.PUBLISHED,
        deletedAt: IsNull(),
      },
      select: {
        id: true,
        authorId: true,
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
        topicId,
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

    const shouldIncrementViews =
      topic.authorId !== userId && (!readState || !readState.firstViewedAt);

    if (!readState) {
      readState = this.forumTopicReadStateRepo.create({
        userId,
        topicId,
        firstViewedAt: new Date(),
        lastReadAt: topic.createdAt,
        lastReadCommentId: null,
      });
    } else if (!readState.firstViewedAt) {
      readState.firstViewedAt = new Date();
    }

    await this.forumTopicReadStateRepo.save(readState);

    if (shouldIncrementViews) {
      await this.topicsRepo.update(topicId, {
        viewsCount: () => '"views_count" + 1',
      });
    }

    return {
      success: true,
      topicId,
      firstViewedAt: readState.firstViewedAt,
    };
  }
}
