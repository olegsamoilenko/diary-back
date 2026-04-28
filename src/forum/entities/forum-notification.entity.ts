// src/forum/entities/forum-notification.entity.ts

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
import { ForumTopic } from './forum-topic.entity';
import { ForumComment } from './forum-comment.entity';
import { ForumNotificationType } from '../types/forum-notification-type.enum';
import { ForumNotificationEntityType } from '../types/forum-notification-entity-type.enum';

@Entity('forum_notifications')
@Index(['userId', 'isRead', 'createdAt'])
@Index(['topicId', 'createdAt'])
@Index(['commentId', 'createdAt'])
export class ForumNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index()
  @Column({
    type: 'enum',
    enum: ForumNotificationType,
  })
  type: ForumNotificationType;

  @Column({ name: 'actor_id', type: 'int', nullable: true })
  actorId: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_id' })
  actor: User | null;

  @Index()
  @Column({
    name: 'entity_type',
    type: 'enum',
    enum: ForumNotificationEntityType,
  })
  entityType: ForumNotificationEntityType;

  @Index()
  @Column({ name: 'entity_id', type: 'uuid' })
  entityId: string;

  @Index()
  @Column({ name: 'topic_id', type: 'uuid', nullable: true })
  topicId: string | null;

  @ManyToOne(() => ForumTopic, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'topic_id' })
  topic: ForumTopic | null;

  @Index()
  @Column({ name: 'comment_id', type: 'uuid', nullable: true })
  commentId: string | null;

  @ManyToOne(() => ForumComment, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'comment_id' })
  comment: ForumComment | null;

  @Index()
  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead: boolean;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
