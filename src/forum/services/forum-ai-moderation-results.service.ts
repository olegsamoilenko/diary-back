import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ForumAiModerationResult } from '../entities/forum-ai-moderation-result.entity';
import { Repository } from 'typeorm';
import { ForumAiModerationTargetType } from '../types/forum-ai-moderation-target-type.enum';
import { ForumAiModerationStatus } from '../types/forum-ai-moderation-status.enum';
import { ForumAiModerationRiskLevel } from '../types/forum-ai-moderation-risk-level.enum';

type CreateForumAiModerationResultInput = {
  targetType: ForumAiModerationTargetType;
  targetId: string;
  status: ForumAiModerationStatus;
  riskLevel: ForumAiModerationRiskLevel;
  categoriesJson?: Record<string, any> | null;
  rawResponseJson?: Record<string, any> | null;
};

@Injectable()
export class ForumAiModerationResultsService {
  constructor(
    @InjectRepository(ForumAiModerationResult)
    private readonly repo: Repository<ForumAiModerationResult>,
  ) {}

  async create(input: CreateForumAiModerationResultInput) {
    return this.repo.save(
      this.repo.create({
        targetType: input.targetType,
        targetId: input.targetId,
        status: input.status,
        riskLevel: input.riskLevel,
        categoriesJson: input.categoriesJson ?? null,
        rawResponseJson: input.rawResponseJson ?? null,
      }),
    );
  }

  async getLatestForTarget(
    targetType: ForumAiModerationTargetType,
    targetId: string,
  ) {
    return this.repo.findOne({
      where: {
        targetType,
        targetId,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async getNeedsReview(page = 1, limit = 50) {
    const safeLimit = Math.min(Math.max(limit || 50, 1), 200);
    const safePage = Math.max(page || 1, 1);

    const [items, total] = await this.repo.findAndCount({
      where: {
        status: ForumAiModerationStatus.NEEDS_REVIEW,
      },
      order: {
        createdAt: 'DESC',
      },
      take: safeLimit,
      skip: (safePage - 1) * safeLimit,
    });

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      hasMore: safePage * safeLimit < total,
    };
  }
}
