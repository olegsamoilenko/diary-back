import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('forum_moderation_ai_monthly_usage')
@Index('uq_forum_moderation_ai_monthly_usage_month_key', ['monthKey'], {
  unique: true,
})
export class ForumModerationAiMonthlyUsage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'month_key', type: 'varchar', length: 7 })
  monthKey: string; // "2026-05"

  @Column({ name: 'period_start', type: 'date' })
  periodStart: string; // "2026-05-01"

  @Column({ name: 'period_end', type: 'date' })
  periodEnd: string; // "2026-06-01"

  @Column({ name: 'input_tokens', type: 'integer', default: 0 })
  inputTokens: number;

  @Column({ name: 'output_tokens', type: 'integer', default: 0 })
  outputTokens: number;

  @Column({ name: 'total_tokens', type: 'integer', default: 0 })
  totalTokens: number;

  @Column({ name: 'llm_review_calls', type: 'integer', default: 0 })
  llmReviewCalls: number;

  @Column({ name: 'moderation_api_calls', type: 'integer', default: 0 })
  moderationApiCalls: number;

  @Column({
    name: 'estimated_cost_usd',
    type: 'numeric',
    precision: 12,
    scale: 6,
    default: 0,
  })
  estimatedCostUsd: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
