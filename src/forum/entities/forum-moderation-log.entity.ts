// src/forum/entities/forum-moderation-log.entity.ts

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { ForumModerationAction } from '../types/forum-moderation-action.enum';
import { ForumModerationTargetType } from '../types/forum-moderation-target-type.enum';

@Entity('forum_moderation_logs')
@Index('IDX_forum_moderation_logs_moderator_created', [
  'moderatorId',
  'createdAt',
])
@Index('IDX_forum_moderation_logs_target', ['targetType', 'targetId'])
@Index('IDX_forum_moderation_logs_action_created', ['action', 'createdAt'])
export class ForumModerationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'moderator_id', type: 'int', nullable: true })
  moderatorId: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'moderator_id' })
  moderator: User | null;

  @Column({
    type: 'enum',
    enum: ForumModerationAction,
  })
  action: ForumModerationAction;

  @Column({
    name: 'target_type',
    type: 'enum',
    enum: ForumModerationTargetType,
  })
  targetType: ForumModerationTargetType;

  // varchar, бо target може бути uuid або number userId
  @Column({ name: 'target_id', type: 'varchar', length: 80 })
  targetId: string;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'metadata_json', type: 'jsonb', nullable: true })
  metadataJson: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
