// forum-ai-moderation/services/forum-openai-moderation.service.ts

import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { ForumModerationDecision } from '../enums/forum-moderation-decision.enum';
import { ForumModerationRuleCode } from '../enums/forum-moderation-rule-code.enum';
import { ForumModerationAiUsageService } from './forum-moderation-ai-usage.service';

export type ForumOpenAiModerationResult = {
  decision: ForumModerationDecision;
  reason: string | null;
  ruleCode: ForumModerationRuleCode | null;
  riskScore: number;
  signals: string[];
  contentHash: string;
  metadataJson: Record<string, any>;
};

@Injectable()
export class ForumOpenAiModerationService {
  private readonly openai: OpenAI;

  constructor(
    private readonly config: ConfigService,
    private readonly moderationAiUsageService: ForumModerationAiUsageService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.getOrThrow<string>('OPENAI_API_KEY'),
    });
  }

  async check(params: {
    userId: number;
    targetType: 'topic' | 'comment';
    title?: string | null;
    content: string;
  }): Promise<ForumOpenAiModerationResult> {
    const text = `${params.title ?? ''}\n${params.content ?? ''}`.trim();

    const normalized = text
      .toLowerCase()
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim();

    const contentHash = createHash('sha256').update(normalized).digest('hex');

    const response = await this.openai.moderations.create({
      model: 'omni-moderation-latest',
      input: text,
    });

    await this.moderationAiUsageService.incrementModerationApiCalls();

    const result = response.results?.[0];

    if (!result) {
      return {
        decision: ForumModerationDecision.NEEDS_LLM_REVIEW,
        reason: 'OpenAI Moderation API returned no result.',
        ruleCode: null,
        riskScore: 0,
        signals: ['openai_moderation_empty_result'],
        contentHash,
        metadataJson: {
          source: 'openai_moderation',
          model: response.model,
        },
      };
    }

    const categories = result.categories ?? {};
    const categoryScores = result.category_scores ?? {};

    const flaggedCategories = Object.entries(categories)
      .filter(([, value]) => value === true)
      .map(([key]) => key);

    const maxScore = Math.max(
      0,
      ...Object.values(categoryScores).filter(
        (value): value is number => typeof value === 'number',
      ),
    );

    if (result.flagged) {
      return {
        decision: ForumModerationDecision.NEEDS_LLM_REVIEW,
        reason: 'Content was flagged by OpenAI Moderation API.',
        ruleCode: this.mapRuleCode(flaggedCategories),
        riskScore: Math.round(maxScore * 100),
        signals: [
          'openai_moderation_flagged',
          ...flaggedCategories.map((category) => `openai_${category}`),
        ],
        contentHash,
        metadataJson: {
          source: 'openai_moderation',
          model: response.model,
          flagged: result.flagged,
          flaggedCategories,
          categories,
          categoryScores,
        },
      };
    }

    return {
      decision: ForumModerationDecision.ALLOW,
      reason: null,
      ruleCode: null,
      riskScore: Math.round(maxScore * 100),
      signals: [],
      contentHash,
      metadataJson: {
        source: 'openai_moderation',
        model: response.model,
        flagged: result.flagged,
        categories,
        categoryScores,
      },
    };
  }

  private mapRuleCode(categories: string[]): ForumModerationRuleCode | null {
    if (categories.includes('sexual/minors')) {
      return ForumModerationRuleCode.OPENAI_SEXUAL_MINORS;
    }

    if (categories.includes('self-harm/instructions')) {
      return ForumModerationRuleCode.OPENAI_SELF_HARM_INSTRUCTIONS;
    }

    if (categories.includes('self-harm/intent')) {
      return ForumModerationRuleCode.OPENAI_SELF_HARM_INTENT;
    }

    if (categories.includes('self-harm')) {
      return ForumModerationRuleCode.OPENAI_SELF_HARM;
    }

    if (categories.includes('harassment/threatening')) {
      return ForumModerationRuleCode.OPENAI_HARASSMENT_THREATENING;
    }

    if (categories.includes('hate/threatening')) {
      return ForumModerationRuleCode.OPENAI_HATE_THREATENING;
    }

    if (categories.includes('illicit/violent')) {
      return ForumModerationRuleCode.OPENAI_ILLICIT_VIOLENT;
    }

    if (categories.includes('violence/graphic')) {
      return ForumModerationRuleCode.OPENAI_VIOLENCE_GRAPHIC;
    }

    if (categories.includes('harassment')) {
      return ForumModerationRuleCode.OPENAI_HARASSMENT;
    }

    if (categories.includes('hate')) {
      return ForumModerationRuleCode.OPENAI_HATE;
    }

    if (categories.includes('illicit')) {
      return ForumModerationRuleCode.OPENAI_ILLICIT;
    }

    if (categories.includes('sexual')) {
      return ForumModerationRuleCode.OPENAI_SEXUAL;
    }

    if (categories.includes('violence')) {
      return ForumModerationRuleCode.OPENAI_VIOLENCE;
    }

    return ForumModerationRuleCode.OPENAI_MODERATION_FLAGGED;
  }
}
