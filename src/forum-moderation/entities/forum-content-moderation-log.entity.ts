import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ForumModerationStage } from '../enums/forum-moderation-stage.enum';
import { ForumModerationDecision } from '../enums/forum-moderation-decision.enum';
import { ForumModerationTargetType } from '../enums/forum-moderation-target-type.enum';
import { ForumModerationRuleCode } from '../enums/forum-moderation-rule-code.enum';

@Entity('forum_content_moderation_logs')
@Index(['userId', 'createdAt'])
@Index(['stage', 'createdAt'])
@Index(['decision', 'createdAt'])
@Index(['ruleCode', 'createdAt'])
export class ForumContentModerationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({
    name: 'target_type',
    type: 'enum',
    enum: ForumModerationTargetType,
  })
  targetType: ForumModerationTargetType;

  @Column({ name: 'target_id', type: 'uuid', nullable: true })
  targetId: string | null;

  @Column({
    type: 'enum',
    enum: ForumModerationStage,
  })
  stage: ForumModerationStage;

  @Column({
    type: 'enum',
    enum: ForumModerationDecision,
  })
  decision: ForumModerationDecision;

  @Column({
    name: 'rule_code',
    type: 'enum',
    enum: ForumModerationRuleCode,
    nullable: true,
  })
  ruleCode: ForumModerationRuleCode | null;

  @Column({ name: 'risk_score', type: 'int', default: 0 })
  riskScore: number;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'title_text', type: 'text', nullable: true })
  titleText: string | null;

  @Column({ name: 'content_text', type: 'text' })
  contentText: string;

  @Column({ name: 'content_hash', type: 'varchar', length: 64, nullable: true })
  contentHash: string | null;

  @Column({ name: 'signals_json', type: 'jsonb', nullable: true })
  signalsJson: string[] | null;

  @Column({ name: 'metadata_json', type: 'jsonb', nullable: true })
  metadataJson: Record<string, any> | null;

  @Column({ name: 'admin_review_status', type: 'varchar', nullable: true })
  adminReviewStatus: 'false_positive' | 'valid_block' | 'ignored' | null;

  @Column({ name: 'admin_reviewed_at', type: 'timestamptz', nullable: true })
  adminReviewedAt: Date | null;

  @Column({ name: 'admin_reviewed_by_id', type: 'int', nullable: true })
  adminReviewedById: number | null;

  @Column({ name: 'admin_note', type: 'text', nullable: true })
  adminNote: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
