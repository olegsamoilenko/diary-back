// src/forum/entities/forum-ai-moderation-result.entity.ts

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ForumAiModerationTargetType } from '../types/forum-ai-moderation-target-type.enum';
import { ForumAiModerationStatus } from '../types/forum-ai-moderation-status.enum';
import { ForumAiModerationRiskLevel } from '../types/forum-ai-moderation-risk-level.enum';

@Entity('forum_ai_moderation_results')
@Index('IDX_forum_ai_moderation_results_target', ['targetType', 'targetId'])
@Index('IDX_forum_ai_moderation_results_status_created', [
  'status',
  'createdAt',
])
@Index('IDX_forum_ai_moderation_results_risk_created', [
  'riskLevel',
  'createdAt',
])
export class ForumAiModerationResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'target_type',
    type: 'enum',
    enum: ForumAiModerationTargetType,
  })
  targetType: ForumAiModerationTargetType;

  // varchar, щоб потім не було проблем, якщо message/topic/comment IDs різні
  @Column({ name: 'target_id', type: 'varchar', length: 80 })
  targetId: string;

  @Column({
    type: 'enum',
    enum: ForumAiModerationStatus,
  })
  status: ForumAiModerationStatus;

  @Column({
    name: 'risk_level',
    type: 'enum',
    enum: ForumAiModerationRiskLevel,
  })
  riskLevel: ForumAiModerationRiskLevel;

  @Column({ name: 'categories_json', type: 'jsonb', nullable: true })
  categoriesJson: Record<string, any> | null;

  @Column({ name: 'raw_response_json', type: 'jsonb', nullable: true })
  rawResponseJson: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
