import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { ForumTopic } from './forum-topic.entity';
import { ForumContentStatus } from '../types/forum-content-status.enum';
import { ForumPublicProfile } from './forum-public-profile.entity';
import { ForumModerationReason } from '../types/forum-moderation-reason.enum';

@Entity('forum_comments')
@Index(['topicId', 'createdAt'])
@Index(['authorId', 'createdAt'])
@Index(['parentCommentId', 'createdAt'])
export class ForumComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'topic_id', type: 'uuid' })
  topicId: string;

  @ManyToOne(() => ForumTopic, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'topic_id' })
  topic: ForumTopic;

  @Index()
  @Column({ name: 'author_id', type: 'int' })
  authorId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author: User;

  authorProfile?: ForumPublicProfile;

  @Index()
  @Column({ name: 'parent_comment_id', type: 'uuid', nullable: true })
  parentCommentId: string | null;

  @ManyToOne(() => ForumComment, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parent_comment_id' })
  parentComment: ForumComment | null;

  @Column({ name: 'reply_to_comment_id', type: 'uuid', nullable: true })
  replyToCommentId: string | null;

  @ManyToOne(() => ForumComment, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reply_to_comment_id' })
  replyToComment: ForumComment | null;

  @Column({ name: 'created_by_admin_id', type: 'int', nullable: true })
  createdByAdminId: number | null;

  @Column({ type: 'text' })
  content: string;

  @Index()
  @Column({
    type: 'enum',
    enum: ForumContentStatus,
    default: ForumContentStatus.PUBLISHED,
  })
  status: ForumContentStatus;

  @Column({ name: 'reactions_count', type: 'int', default: 0 })
  reactionsCount: number;

  @Column({ name: 'likes_count', type: 'int', default: 0 })
  likesCount: number;

  @Column({ name: 'reports_count', type: 'int', default: 0 })
  reportsCount: number;

  @Column({ name: 'is_edited', type: 'boolean', default: false })
  isEdited: boolean;

  @Column({ name: 'edited_at', type: 'timestamptz', nullable: true })
  editedAt: Date | null;

  @Column({ name: 'is_removed', type: 'boolean', default: false })
  isRemoved: boolean;

  @Column({ name: 'removed_at', type: 'timestamptz', nullable: true })
  removedAt: Date | null;

  @Column({ name: 'is_deleted_by_author', type: 'boolean', default: false })
  isDeletedByAuthor: boolean;

  @Column({ name: 'deleted_by_author_at', type: 'timestamptz', nullable: true })
  deletedByAuthorAt: Date | null;

  @Column({ name: 'is_moderation_removed', type: 'boolean', default: false })
  isModerationRemoved: boolean;

  @Column({
    name: 'moderation_removed_at',
    type: 'timestamptz',
    nullable: true,
  })
  moderationRemovedAt: Date | null;

  @Column({
    name: 'moderation_removed_by_admin_id',
    type: 'int',
    nullable: true,
  })
  moderationRemovedByAdminId: number | null;

  @Column({
    name: 'moderation_remove_reason',
    type: 'enum',
    enum: ForumModerationReason,
    nullable: true,
  })
  moderationRemoveReason: ForumModerationReason | null;

  @Column({ name: 'moderation_remove_note', type: 'text', nullable: true })
  moderationRemoveNote: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
