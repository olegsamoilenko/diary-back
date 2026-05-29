import { HttpException, Injectable } from '@nestjs/common';
import { ForumAbuseGuardService } from './services/forum-abuse-guard.service';
import { ForumBaselineRiskCheckService } from './services/forum-baseline-risk-check.service';
import { ForumModerationLogService } from './services/forum-moderation-log.service';
import { ForumModerationDecision } from './enums/forum-moderation-decision.enum';
import { ForumModerationStage } from './enums/forum-moderation-stage.enum';
import { ForumModerationTargetType } from './enums/forum-moderation-target-type.enum';
import { ForumModerationRuleCode } from './enums/forum-moderation-rule-code.enum';
import { ForumOpenAiModerationService } from './services/forum-openai-moderation.service';
import { ForumLlmModerationService } from './services/forum-llm-moderation.service';
import { sendForumModerationTelegram } from '../telegram/send-telegram';
import {
  formatForumModerationBlockedTelegram,
  formatForumModerationNeedsReviewTelegram,
} from './utils/telegram-moderation-formatter';
import { InjectRepository } from '@nestjs/typeorm';
import { ForumPublicProfile } from '../forum/entities/forum-public-profile.entity';
import { Repository } from 'typeorm';
import { HttpStatus } from 'src/common/utils/http-status';
import throwError from 'src/common/utils/error';
import { ForumContentModerationLog } from './entities/forum-content-moderation-log.entity';
import { GetForumModerationLogsQueryDto } from './dto/get-forum-moderation-logs-query.dto';
import { User } from 'src/users/entities/user.entity';

@Injectable()
export class ForumModerationService {
  constructor(
    private readonly abuseGuard: ForumAbuseGuardService,
    private readonly baselineRiskCheck: ForumBaselineRiskCheckService,
    private readonly logs: ForumModerationLogService,
    private readonly forumOpenAiModerationService: ForumOpenAiModerationService,
    private readonly forumLlmModerationService: ForumLlmModerationService,
    @InjectRepository(ForumPublicProfile)
    private readonly forumPublicProfileRepo: Repository<ForumPublicProfile>,
    @InjectRepository(ForumContentModerationLog)
    private readonly moderationLogsRepo: Repository<ForumContentModerationLog>,
  ) {}

  async moderateOrThrow(params: {
    userId: number;
    targetType: ForumModerationTargetType;
    actionType: 'create' | 'update';
    targetId?: string | null;
    title?: string | null;
    content: string;
  }): Promise<void> {
    const authorPublicProfile = await this.forumPublicProfileRepo.findOne({
      where: { userId: params.userId },
      select: {
        username: true,
      },
    });

    const authorNickname = authorPublicProfile?.username?.trim() || 'Someone';

    const telegramIds =
      params.targetType === ForumModerationTargetType.TOPIC
        ? { topicId: params.targetId }
        : { commentId: params.targetId };

    try {
      await this.abuseGuard.checkOrThrow({
        userId: params.userId,
        targetType: params.targetType,
        title: params.title,
        content: params.content,
      });
    } catch (error) {
      await this.logs.createBlockedLog({
        ...params,
        stage: ForumModerationStage.BASELINE_RISK_CHECK,
        decision: ForumModerationDecision.BLOCK,
        ruleCode: ForumModerationRuleCode.RATE_LIMIT_OR_DUPLICATE,
        riskScore: 0,
        reason:
          error instanceof Error
            ? error.message
            : 'Content was blocked by abuse protection.',
        contentHash: null,
        signals: ['abuse_guard_rejected'],
        metadataJson: {
          source: 'forum_abuse_guard',
        },
      });
      await sendForumModerationTelegram(
        formatForumModerationBlockedTelegram({
          authorNickname,
          actionType: params.actionType,
          ruleCode: ForumModerationRuleCode.RATE_LIMIT_OR_DUPLICATE,
          decision: ForumModerationDecision.BLOCK,
          reason:
            error instanceof Error
              ? error.message
              : 'Content was blocked by abuse protection.',
          signals: ['abuse_guard_rejected'],
          riskScore: 0,
          authorId: params.userId,
          targetType: params.targetType,
          title: params.title,
          content: params.content,
          ...telegramIds,
        }),
      );

      throw error;
    }

    const baselineResult = await this.baselineRiskCheck.check({
      userId: params.userId,
      targetType: params.targetType,
      title: params.title,
      content: params.content,
    });

    if (baselineResult.decision === ForumModerationDecision.NEEDS_LLM_REVIEW) {
      const llmModerationResult = await this.forumLlmModerationService.check({
        ...params,
        previousStageResult: baselineResult,
      });

      if (llmModerationResult.decision === ForumModerationDecision.ALLOW) {
        return;
      }

      if (
        llmModerationResult.decision === ForumModerationDecision.ESCALATE_HUMAN
      ) {
        await this.logs.createBlockedLog({
          ...params,
          stage: ForumModerationStage.LLM_RULES_MODERATION,
          decision: ForumModerationDecision.ESCALATE_HUMAN,
          ruleCode: llmModerationResult.ruleCode,
          riskScore: llmModerationResult.riskScore,
          reason: llmModerationResult.reason,
          contentHash: llmModerationResult.contentHash,
          signals: llmModerationResult.signals,
          metadataJson: llmModerationResult.metadataJson,
        });

        await sendForumModerationTelegram(
          formatForumModerationNeedsReviewTelegram({
            authorNickname,
            ruleCode: llmModerationResult.ruleCode,
            decision: ForumModerationDecision.ESCALATE_HUMAN,
            reason: llmModerationResult.reason,
            signals: llmModerationResult.signals,
            riskScore: llmModerationResult.riskScore,
            authorId: params.userId,
            targetType: params.targetType,
            title: params.title,
            content: params.content,
            ...telegramIds,
          }),
        );

        return;
      }

      if (llmModerationResult.decision === ForumModerationDecision.BLOCK) {
        await this.logs.createBlockedLog({
          ...params,
          stage: ForumModerationStage.LLM_RULES_MODERATION,
          decision: ForumModerationDecision.BLOCK,
          ruleCode: llmModerationResult.ruleCode,
          riskScore: llmModerationResult.riskScore,
          reason: llmModerationResult.reason,
          contentHash: llmModerationResult.contentHash,
          signals: llmModerationResult.signals,
          metadataJson: llmModerationResult.metadataJson,
        });

        const userMessage =
          typeof llmModerationResult.metadataJson?.userMessage === 'string' &&
          llmModerationResult.metadataJson.userMessage.trim()
            ? llmModerationResult.metadataJson.userMessage
            : llmModerationResult.reason;

        await sendForumModerationTelegram(
          formatForumModerationBlockedTelegram({
            authorNickname,
            actionType: params.actionType,
            ruleCode: llmModerationResult.ruleCode,
            decision: ForumModerationDecision.BLOCK,
            reason: llmModerationResult.reason,
            signals: llmModerationResult.signals,
            riskScore: llmModerationResult.riskScore,
            authorId: params.userId,
            targetType: params.targetType,
            title: params.title,
            content: params.content,
            userMessage,
            ...telegramIds,
          }),
        );

        throwError(
          HttpStatus.FORUM_CONTENT_BLOCKED_BY_MODERATION,
          'Forum content blocked by moderation',
          userMessage,
          'FORUM_CONTENT_BLOCKED_BY_MODERATION',
          {
            userMessage,
            ruleCode: llmModerationResult.ruleCode,
          },
        );
      }
    }

    if (baselineResult.decision === ForumModerationDecision.ALLOW) {
      const openAiModerationResult =
        await this.forumOpenAiModerationService.check({
          userId: params.userId,
          targetType: params.targetType,
          title: params.title,
          content: params.content,
        });

      if (openAiModerationResult.decision === ForumModerationDecision.ALLOW) {
        return;
      }

      const llmModerationResult = await this.forumLlmModerationService.check({
        ...params,
        previousStageResult: openAiModerationResult,
      });

      if (llmModerationResult.decision === ForumModerationDecision.ALLOW) {
        return;
      }

      if (
        llmModerationResult.decision === ForumModerationDecision.ESCALATE_HUMAN
      ) {
        await this.logs.createBlockedLog({
          ...params,
          stage: ForumModerationStage.LLM_RULES_MODERATION,
          decision: ForumModerationDecision.ESCALATE_HUMAN,
          ruleCode: llmModerationResult.ruleCode,
          riskScore: llmModerationResult.riskScore,
          reason: llmModerationResult.reason,
          contentHash: llmModerationResult.contentHash,
          signals: llmModerationResult.signals,
          metadataJson: llmModerationResult.metadataJson,
        });

        await sendForumModerationTelegram(
          formatForumModerationNeedsReviewTelegram({
            authorNickname,
            ruleCode: llmModerationResult.ruleCode,
            decision: ForumModerationDecision.ESCALATE_HUMAN,
            reason: llmModerationResult.reason,
            signals: llmModerationResult.signals,
            riskScore: llmModerationResult.riskScore,
            authorId: params.userId,
            targetType: params.targetType,
            title: params.title,
            content: params.content,
            ...telegramIds,
          }),
        );

        return;
      }

      if (llmModerationResult.decision === ForumModerationDecision.BLOCK) {
        await this.logs.createBlockedLog({
          ...params,
          stage: ForumModerationStage.LLM_RULES_MODERATION,
          decision: ForumModerationDecision.BLOCK,
          ruleCode: llmModerationResult.ruleCode,
          riskScore: llmModerationResult.riskScore,
          reason: llmModerationResult.reason,
          contentHash: llmModerationResult.contentHash,
          signals: llmModerationResult.signals,
          metadataJson: llmModerationResult.metadataJson,
        });

        const userMessage =
          typeof llmModerationResult.metadataJson?.userMessage === 'string' &&
          llmModerationResult.metadataJson.userMessage.trim()
            ? llmModerationResult.metadataJson.userMessage
            : llmModerationResult.reason;

        await sendForumModerationTelegram(
          formatForumModerationBlockedTelegram({
            authorNickname,
            actionType: params.actionType,
            ruleCode: llmModerationResult.ruleCode,
            decision: ForumModerationDecision.BLOCK,
            reason: llmModerationResult.reason,
            signals: llmModerationResult.signals,
            riskScore: llmModerationResult.riskScore,
            authorId: params.userId,
            targetType: params.targetType,
            title: params.title,
            content: params.content,
            userMessage,
            ...telegramIds,
          }),
        );

        throwError(
          HttpStatus.FORUM_CONTENT_BLOCKED_BY_MODERATION,
          'Forum content blocked by moderation',
          userMessage,
          'FORUM_CONTENT_BLOCKED_BY_MODERATION',
          {
            userMessage,
            ruleCode: llmModerationResult.ruleCode,
          },
        );
      }
    }

    throwError(
      HttpStatus.FORUM_UNEXPECTED_MODERATION_DECISION,
      'Unexpected moderation decision',
      'Unexpected moderation decision.',
      'FORUM_UNEXPECTED_MODERATION_DECISION',
    );
  }

  async getModerationLogs(params: GetForumModerationLogsQueryDto): Promise<{
    logs: any[];
    total: number;
    page: number;
    pageCount: number;
    limit: number;
  }> {
    const { page = 1, limit = 50, userId, targetType } = params;

    const safeLimit = Math.min(Math.max(limit ?? 50, 1), 200);
    const safePage = Math.max(page ?? 1, 1);

    const baseQb = this.moderationLogsRepo
      .createQueryBuilder('log')
      .leftJoinAndSelect(User, 'u', 'u.id = log.userId')
      .leftJoinAndSelect('u.settings', 's');

    if (userId) {
      baseQb.andWhere('log.userId = :userId', {
        userId,
      });
    }

    if (targetType) {
      baseQb.andWhere('log.targetType = :targetType', {
        targetType,
      });
    }

    const listQb = baseQb.clone();

    listQb
      .orderBy('log.createdAt', 'DESC')
      .addOrderBy('log.id', 'DESC')
      .take(safeLimit)
      .skip((safePage - 1) * safeLimit);

    const { entities, raw } = await listQb.getRawAndEntities();

    const total = await baseQb.clone().getCount();

    const usersByLogId = new Map<string, any>();

    for (const r of raw) {
      usersByLogId.set(r['log_id'], {
        id: r['u_id'],
        uuid: r['u_uuid'],
        email: r['u_email'],
        createdAt: r['u_created_at'],
        settings: {
          id: r['s_id'],
          lang: r['s_lang'],
        },
      });
    }

    const logs = entities.map((log) => ({
      ...log,
      user: usersByLogId.get(log.id) ?? null,
    }));

    return {
      logs,
      total,
      page: safePage,
      pageCount: Math.max(1, Math.ceil(total / safeLimit)),
      limit: safeLimit,
    };
  }
}
