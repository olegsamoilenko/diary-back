import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ForumModerationLog } from '../entities/forum-moderation-log.entity';
import { Repository } from 'typeorm';
import { ForumModerationAction } from '../types/forum-moderation-action.enum';
import { ForumModerationTargetType } from '../types/forum-moderation-target-type.enum';

type CreateForumModerationLogInput = {
  moderatorId?: number | null;
  action: ForumModerationAction;
  targetType: ForumModerationTargetType;
  targetId: string;
  reason?: string | null;
  metadataJson?: Record<string, any> | null;
};

@Injectable()
export class ForumModerationLogsService {
  constructor(
    @InjectRepository(ForumModerationLog)
    private readonly repo: Repository<ForumModerationLog>,
  ) {}

  async create(input: CreateForumModerationLogInput) {
    return this.repo.save(
      this.repo.create({
        moderatorId: input.moderatorId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason?.trim() || null,
        metadataJson: input.metadataJson ?? null,
      }),
    );
  }

  async getLogs(page = 1, limit = 50) {
    const safeLimit = Math.min(Math.max(limit || 50, 1), 200);
    const safePage = Math.max(page || 1, 1);

    const [items, total] = await this.repo.findAndCount({
      order: {
        createdAt: 'DESC',
      },
      take: safeLimit,
      skip: (safePage - 1) * safeLimit,
      relations: {
        moderator: true,
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

  async getTargetLogs(targetType: ForumModerationTargetType, targetId: string) {
    return this.repo.find({
      where: {
        targetType,
        targetId,
      },
      order: {
        createdAt: 'DESC',
      },
      relations: {
        moderator: true,
      },
    });
  }
}
