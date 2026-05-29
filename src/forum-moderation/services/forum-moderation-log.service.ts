import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ForumContentModerationLog } from '../entities/forum-content-moderation-log.entity';
import { ForumModerationStage } from '../enums/forum-moderation-stage.enum';
import { ForumModerationDecision } from '../enums/forum-moderation-decision.enum';
import { ForumModerationTargetType } from '../enums/forum-moderation-target-type.enum';
import { ForumModerationRuleCode } from '../enums/forum-moderation-rule-code.enum';

@Injectable()
export class ForumModerationLogService {
  constructor(
    @InjectRepository(ForumContentModerationLog)
    private readonly repo: Repository<ForumContentModerationLog>,
  ) {}

  async createBlockedLog(params: {
    userId: number;
    targetType: ForumModerationTargetType;
    targetId?: string | null;
    stage: ForumModerationStage;
    decision: ForumModerationDecision;
    ruleCode?: ForumModerationRuleCode | null;
    riskScore?: number;
    reason?: string | null;
    title?: string | null;
    content: string;
    contentHash?: string | null;
    signals?: string[] | null;
    metadataJson?: Record<string, any> | null;
  }) {
    const log = this.repo.create({
      userId: params.userId,
      targetType: params.targetType,
      targetId: params.targetId ?? null,
      stage: params.stage,
      decision: params.decision,
      ruleCode: params.ruleCode ?? null,
      riskScore: params.riskScore ?? 0,
      reason: params.reason ?? null,
      titleText: params.title ?? null,
      contentText: params.content,
      contentHash: params.contentHash ?? null,
      signalsJson: params.signals ?? null,
      metadataJson: params.metadataJson ?? null,
    });

    return this.repo.save(log);
  }
}
