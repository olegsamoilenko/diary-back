import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { ForumTopic } from './forum-topic.entity';
import { ForumMentionTargetType } from '../types/forum-mention-target-type.enum';

@Entity('forum_mentions')
@Unique('UQ_forum_mentions_unique_target_user', [
  'mentionedUserId',
  'targetType',
  'targetId',
])
@Index('IDX_forum_mentions_mentioned_user_created', [
  'mentionedUserId',
  'createdAt',
])
@Index('IDX_forum_mentions_target', ['targetType', 'targetId'])
@Index('IDX_forum_mentions_topic_created', ['topicId', 'createdAt'])
export class ForumMention {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'mentioned_user_id', type: 'int' })
  mentionedUserId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mentioned_user_id' })
  mentionedUser: User;

  @Column({ name: 'mentioned_by_user_id', type: 'int' })
  mentionedByUserId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mentioned_by_user_id' })
  mentionedByUser: User;

  @Column({
    name: 'target_type',
    type: 'enum',
    enum: ForumMentionTargetType,
  })
  targetType: ForumMentionTargetType;

  @Column({ name: 'target_id', type: 'varchar', length: 80 })
  targetId: string;

  @Column({ name: 'topic_id', type: 'uuid', nullable: true })
  topicId: string | null;

  @ManyToOne(() => ForumTopic, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'topic_id' })
  topic: ForumTopic | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
