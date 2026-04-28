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

  async getTopicComments(topicId: string) {
    const topic = await this.topicsRepo.findOne({
      where: {
        id: topicId,
        status: ForumContentStatus.PUBLISHED,
      },
    });

    if (!topic) {
      throw new NotFoundException('Topic not found');
    }

    return this.commentsRepo.find({
      where: {
        topicId,
        status: ForumContentStatus.PUBLISHED,
        deletedAt: IsNull(),
      },
      order: {
        createdAt: 'ASC',
      },
      relations: {
        author: true,
        parentComment: true,
      },
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

      let parentComment: ForumComment | null = null;

      if (dto.parentCommentId) {
        parentComment = await commentRepo.findOne({
          where: {
            id: dto.parentCommentId,
            topicId,
            status: ForumContentStatus.PUBLISHED,
          },
        });

        if (!parentComment) {
          throw new NotFoundException('Parent comment not found');
        }

        if (parentComment.parentCommentId) {
          throw new BadRequestException('Nested replies are not allowed');
        }
      }

      const comment = commentRepo.create({
        topicId,
        authorId: userId,
        parentCommentId: dto.parentCommentId ?? null,
        content,
        status: ForumContentStatus.PUBLISHED,
      });

      const savedComment = await commentRepo.save(comment);

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
        lastCommentId: savedComment.id,
      });

      // TODO later:
      // 1. create notifications для watchers
      // 2. notify author if reply to their comment
      // 3. run AI moderation before/after publish

      return savedComment;
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
