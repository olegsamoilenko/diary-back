import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { ForumComment } from '../entities/forum-comment.entity';
import { ForumTopic } from '../entities/forum-topic.entity';
import { CreateForumCommentDto } from '../dto/create-forum-comment.dto';
import { ForumContentStatus } from '../types/forum-content-status.enum';
import { ForumTopicWatcher } from '../entities/forum-topic-watcher.entity';
import { ForumTopicWatchType } from '../types/forum-topic-watch-type.enum';
import { ForumPublicProfile } from '../entities/forum-public-profile.entity';
import { ForumReaction } from '../entities/forum-reaction.entity';
import { ForumReactionTargetType } from '../types/forum-reaction-target-type.enum';
import { ForumReactionType } from '../types/forum-reaction-type.enum';

type ForumCommentWithMyLike = ForumComment & {
  myLike?: ForumReaction | null;
};

type ForumCommentResponse = ForumComment & {
  likedByMe: boolean;
};

@Injectable()
export class ForumCommentsService {
  constructor(
    @InjectRepository(ForumComment)
    private readonly commentsRepo: Repository<ForumComment>,

    @InjectRepository(ForumTopic)
    private readonly topicsRepo: Repository<ForumTopic>,

    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getTopicComments(
    topicId: string,
    userId: number,
  ): Promise<ForumCommentResponse[]> {
    const topic = await this.topicsRepo.findOne({
      where: {
        id: topicId,
        status: ForumContentStatus.PUBLISHED,
      },
    });

    if (!topic) {
      throw new NotFoundException('Topic not found');
    }

    const comments = await this.commentsRepo
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.parentComment', 'parentComment')
      .leftJoinAndSelect('comment.replyToComment', 'replyToComment')
      .leftJoinAndMapOne(
        'comment.authorProfile',
        ForumPublicProfile,
        'authorProfile',
        'authorProfile.userId = comment.authorId',
      )
      .leftJoinAndMapOne(
        'parentComment.authorProfile',
        ForumPublicProfile,
        'parentAuthorProfile',
        'parentAuthorProfile.userId = parentComment.authorId',
      )
      .leftJoinAndMapOne(
        'replyToComment.authorProfile',
        ForumPublicProfile,
        'replyToAuthorProfile',
        'replyToAuthorProfile.userId = replyToComment.authorId',
      )
      .leftJoinAndMapOne(
        'comment.myLike',
        ForumReaction,
        'myLike',
        `
        myLike.targetId = comment.id
        AND myLike.targetType = :commentTargetType
        AND myLike.reactionType = :likeReactionType
        AND myLike.userId = :userId
      `,
      )
      .where('comment.topicId = :topicId', { topicId })
      .andWhere('comment.status = :status', {
        status: ForumContentStatus.PUBLISHED,
      })
      .andWhere('comment.deletedAt IS NULL')
      .setParameters({
        userId,
        commentTargetType: ForumReactionTargetType.COMMENT,
        likeReactionType: ForumReactionType.LIKE,
      })
      .orderBy('comment.createdAt', 'ASC')
      .getMany();

    return comments.map((comment): ForumCommentResponse => {
      const commentWithMyLike = comment as ForumCommentWithMyLike;
      const { myLike, ...rest } = commentWithMyLike;

      return {
        ...rest,
        likedByMe: Boolean(myLike),
      };
    });
  }

  async createComment(
    userId: number,
    topicId: string,
    dto: CreateForumCommentDto,
  ) {
    const content = dto.content.trim();

    if (!content) {
      throw new BadRequestException('Comment content is required');
    }

    return this.dataSource.transaction(async (manager) => {
      const topicRepo = manager.getRepository(ForumTopic);
      const commentRepo = manager.getRepository(ForumComment);

      const topic = await topicRepo.findOne({
        where: {
          id: topicId,
          status: ForumContentStatus.PUBLISHED,
        },
      });

      if (!topic) {
        throw new NotFoundException('Topic not found');
      }

      if (topic.isLocked) {
        throw new ForbiddenException('Topic is locked');
      }

      let parentCommentId: string | null = null;
      let replyToCommentId: string | null = null;

      if (dto.replyToCommentId) {
        const replyTarget = await commentRepo.findOne({
          where: {
            id: dto.replyToCommentId,
            topicId,
            status: ForumContentStatus.PUBLISHED,
          },
        });

        if (!replyTarget) {
          throw new NotFoundException('Reply target comment not found');
        }

        replyToCommentId = replyTarget.id;

        parentCommentId = replyTarget.parentCommentId
          ? replyTarget.parentCommentId
          : replyTarget.id;
      } else if (dto.parentCommentId) {
        const parentComment = await commentRepo.findOne({
          where: {
            id: dto.parentCommentId,
            topicId,
            status: ForumContentStatus.PUBLISHED,
          },
        });

        if (!parentComment) {
          throw new NotFoundException('Parent comment not found');
        }

        replyToCommentId = parentComment.id;

        parentCommentId = parentComment.parentCommentId
          ? parentComment.parentCommentId
          : parentComment.id;
      }

      const comment = commentRepo.create({
        topicId,
        authorId: userId,
        parentCommentId,
        replyToCommentId,
        content,
        status: ForumContentStatus.PUBLISHED,
      });

      const savedComment = await commentRepo.save(comment);

      const savedCommentWithAuthorProfile = await commentRepo
        .createQueryBuilder('comment')
        .leftJoinAndSelect('comment.replyToComment', 'replyToComment')
        .leftJoinAndMapOne(
          'comment.authorProfile',
          ForumPublicProfile,
          'authorProfile',
          'authorProfile.userId = comment.authorId',
        )
        .leftJoinAndMapOne(
          'replyToComment.authorProfile',
          ForumPublicProfile,
          'replyToAuthorProfile',
          'replyToAuthorProfile.userId = replyToComment.authorId',
        )
        .where('comment.id = :commentId', { commentId: savedComment.id })
        .getOne();

      if (!savedCommentWithAuthorProfile) {
        throw new NotFoundException('Saved comment not found');
      }

      const watcherRepo = manager.getRepository(ForumTopicWatcher);
      const now = new Date();

      const existingWatcher = await watcherRepo.findOne({
        where: {
          userId,
          topicId,
        },
      });

      if (!existingWatcher) {
        await watcherRepo.save(
          watcherRepo.create({
            userId,
            topicId,
            watchType: ForumTopicWatchType.AUTO_COMMENTER,
            isMuted: false,
            lastReadAt: now,
          }),
        );

        await topicRepo.update(topicId, {
          watchersCount: () => '"watchers_count" + 1',
        });
      } else {
        await watcherRepo.update(
          {
            userId,
            topicId,
          },
          {
            lastReadAt: now,
          },
        );
      }

      await topicRepo.update(topicId, {
        commentsCount: () => '"comments_count" + 1',
        lastActivityAt: now,
        lastCommentAuthorId: userId,
        lastCommentId: savedComment.id,
      });

      return savedCommentWithAuthorProfile;
    });
  }

  async deleteComment(userId: number, commentId: string) {
    const comment = await this.commentsRepo.findOne({
      where: {
        id: commentId,
      },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    if (comment.authorId !== userId) {
      throw new ForbiddenException('You cannot delete this comment');
    }

    await this.dataSource.transaction(async (manager) => {
      const commentRepo = manager.getRepository(ForumComment);
      const topicRepo = manager.getRepository(ForumTopic);

      await commentRepo.softDelete(commentId);

      await topicRepo.update(comment.topicId, {
        commentsCount: () => 'GREATEST("comments_count" - 1, 0)',
      });
    });

    return { success: true };
  }
}
