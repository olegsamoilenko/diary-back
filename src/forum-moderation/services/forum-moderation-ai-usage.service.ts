import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

type AddForumModerationAiMonthlyUsageParams = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: string | number;
};

type ForumModerationAiMonthlyUsageRow = {
  monthKey: string;
  periodStart: string;
  periodEnd: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  llmReviewCalls: number;
  moderationApiCalls: number;
  estimatedCostUsd: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ForumModerationAiUsageService {
  constructor(private readonly dataSource: DataSource) {}

  async addLlmReviewUsage(params: AddForumModerationAiMonthlyUsageParams) {
    const now = new Date();

    const monthKey = this.getMonthKey(now);
    const periodStart = `${monthKey}-01`;
    const periodEnd = this.getNextMonthStart(monthKey);

    const inputTokens = params.inputTokens ?? 0;
    const outputTokens = params.outputTokens ?? 0;
    const totalTokens = params.totalTokens ?? inputTokens + outputTokens;

    const estimatedCostUsd = String(params.estimatedCostUsd ?? '0');

    await this.dataSource.query(
      `
        INSERT INTO forum_moderation_ai_monthly_usage (
          month_key,
          period_start,
          period_end,
          input_tokens,
          output_tokens,
          total_tokens,
          llm_review_calls,
          moderation_api_calls,
          estimated_cost_usd,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 1, 0, $7, NOW(), NOW())
        ON CONFLICT (month_key)
        DO UPDATE SET
          input_tokens = forum_moderation_ai_monthly_usage.input_tokens + EXCLUDED.input_tokens,
          output_tokens = forum_moderation_ai_monthly_usage.output_tokens + EXCLUDED.output_tokens,
          total_tokens = forum_moderation_ai_monthly_usage.total_tokens + EXCLUDED.total_tokens,
          llm_review_calls = forum_moderation_ai_monthly_usage.llm_review_calls + 1,
          estimated_cost_usd = forum_moderation_ai_monthly_usage.estimated_cost_usd + EXCLUDED.estimated_cost_usd,
          updated_at = NOW()
      `,
      [
        monthKey,
        periodStart,
        periodEnd,
        inputTokens,
        outputTokens,
        totalTokens,
        estimatedCostUsd,
      ],
    );
  }

  async incrementModerationApiCalls() {
    const now = new Date();

    const monthKey = this.getMonthKey(now);
    const periodStart = `${monthKey}-01`;
    const periodEnd = this.getNextMonthStart(monthKey);

    await this.dataSource.query(
      `
        INSERT INTO forum_moderation_ai_monthly_usage (
          month_key,
          period_start,
          period_end,
          input_tokens,
          output_tokens,
          total_tokens,
          llm_review_calls,
          moderation_api_calls,
          estimated_cost_usd,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, 0, 0, 0, 0, 1, 0, NOW(), NOW())
        ON CONFLICT (month_key)
        DO UPDATE SET
          moderation_api_calls = forum_moderation_ai_monthly_usage.moderation_api_calls + 1,
          updated_at = NOW()
      `,
      [monthKey, periodStart, periodEnd],
    );
  }

  async getMonthlyUsage(): Promise<ForumModerationAiMonthlyUsageRow[]> {
    return await this.dataSource.query(
      `
      SELECT
        month_key AS "monthKey",
        period_start AS "periodStart",
        period_end AS "periodEnd",
        input_tokens AS "inputTokens",
        output_tokens AS "outputTokens",
        total_tokens AS "totalTokens",
        llm_review_calls AS "llmReviewCalls",
        moderation_api_calls AS "moderationApiCalls",
        estimated_cost_usd AS "estimatedCostUsd",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM forum_moderation_ai_monthly_usage
      ORDER BY period_start DESC
    `,
    );
  }

  private getMonthKey(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');

    return `${year}-${month}`;
  }

  private getNextMonthStart(monthKey: string): string {
    const [year, month] = monthKey.split('-').map(Number);

    const nextMonthDate = new Date(Date.UTC(year, month, 1));

    const nextYear = nextMonthDate.getUTCFullYear();
    const nextMonth = String(nextMonthDate.getUTCMonth() + 1).padStart(2, '0');

    return `${nextYear}-${nextMonth}-01`;
  }
}
