import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ForumReaction } from '../entities/forum-reaction.entity';
import { ForumTopic } from '../entities/forum-topic.entity';
import { ForumComment } from '../entities/forum-comment.entity';
import { ToggleForumReactionDto } from '../dto/toggle-forum-reaction.dto';
import { ForumReactionTargetType } from '../types/forum-reaction-target-type.enum';
import { ForumContentStatus } from '../types/forum-content-status.enum';

@Injectable()
export class ForumReactionsService {
  constructor(
    @InjectRepository(ForumReaction)
    private readonly reactionsRepo: Repository<ForumReaction>,

    @InjectRepository(ForumTopic)
    private readonly topicsRepo: Repository<ForumTopic>,

    @InjectRepository(ForumComment)
    private readonly commentsRepo: Repository<ForumComment>,

    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async toggleReaction(userId: number, dto: ToggleForumReactionDto) {
    await this.ensureTargetExists(dto.targetType, dto.targetId);

    return this.dataSource.transaction(async (manager) => {
      const reactionRepo = manager.getRepository(ForumReaction);
      const topicRepo = manager.getRepository(ForumTopic);
      const commentRepo = manager.getRepository(ForumComment);

      const existing = await reactionRepo.findOne({
        where: {
          userId,
          targetType: dto.targetType,
          targetId: dto.targetId,
          reactionType: dto.reactionType,
        },
      });

      if (existing) {
        await reactionRepo.delete(existing.id);

        if (dto.targetType === ForumReactionTargetType.TOPIC) {
          await topicRepo.update(dto.targetId, {
            reactionsCount: () => 'GREATEST("reactions_count" - 1, 0)',
          });
        } else {
          await commentRepo.update(dto.targetId, {
            reactionsCount: () => 'GREATEST("reactions_count" - 1, 0)',
          });
        }

        return {
          active: false,
          reactionType: dto.reactionType,
        };
      }

      await reactionRepo.save(
        reactionRepo.create({
          userId,
          targetType: dto.targetType,
          targetId: dto.targetId,
          reactionType: dto.reactionType,
        }),
      );

      if (dto.targetType === ForumReactionTargetType.TOPIC) {
        await topicRepo.update(dto.targetId, {
          reactionsCount: () => '"reactions_count" + 1',
        });
      } else {
        await commentRepo.update(dto.targetId, {
          reactionsCount: () => '"reactions_count" + 1',
        });
      }

      return {
        active: true,
        reactionType: dto.reactionType,
      };
    });
  }

  async getTargetReactions(
    targetType: ForumReactionTargetType,
    targetId: string,
  ) {
    return this.reactionsRepo
      .createQueryBuilder('r')
      .select('r.reaction_type', 'reactionType')
      .addSelect('COUNT(*)', 'count')
      .where('r.target_type = :targetType', { targetType })
      .andWhere('r.target_id = :targetId', { targetId })
      .groupBy('r.reaction_type')
      .getRawMany();
  }

  private async ensureTargetExists(
    targetType: ForumReactionTargetType,
    targetId: string,
  ) {
    if (targetType === ForumReactionTargetType.TOPIC) {
      const exists = await this.topicsRepo.exists({
        where: {
          id: targetId,
          status: ForumContentStatus.PUBLISHED,
        },
      });

      if (!exists) {
        throw new NotFoundException('Topic not found');
      }

      return;
    }

    if (targetType === ForumReactionTargetType.COMMENT) {
      const exists = await this.commentsRepo.exists({
        where: {
          id: targetId,
          status: ForumContentStatus.PUBLISHED,
        },
      });

      if (!exists) {
        throw new NotFoundException('Comment not found');
      }

      return;
    }

    throw new BadRequestException('Invalid reaction target type');
  }
}
