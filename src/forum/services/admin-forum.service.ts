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

@Injectable()
export class AdminForumService {
  constructor(
    private readonly dataSource: DataSource,

    @InjectRepository(ForumTopic)
    private readonly topicsRepo: Repository<ForumTopic>,

    @InjectRepository(ForumComment)
    private readonly commentsRepo: Repository<ForumComment>,

    @InjectRepository(ForumModerationLog)
    private readonly moderationLogsRepo: Repository<ForumModerationLog>,
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
      .leftJoinAndSelect('comment.author', 'author')
      .leftJoinAndSelect('author.settings', 'authorSettings')
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
}
