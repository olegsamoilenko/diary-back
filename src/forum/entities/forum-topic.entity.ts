import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { ForumCategory } from './forum-category.entity';
import { ForumTopicType } from '../types/forum-topic-type.enum';
import { ForumContentStatus } from '../types/forum-content-status.enum';
import { ForumTopicVisibility } from '../types/forum-topic-visibility.enum';
import { ForumPublicProfile } from './forum-public-profile.entity';
import { ForumComment } from './forum-comment.entity';
import { ForumModerationReason } from '../types/forum-moderation-reason.enum';
import { ForumTopicTranslation } from './forum-topic-translation.entity';

@Entity('forum_topics')
@Index(['categoryId', 'status', 'lastActivityAt'])
@Index(['authorId', 'createdAt'])
export class ForumTopic {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'author_id', type: 'int', nullable: true })
  authorId: number;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'author_id' })
  author: User;

  authorProfile?: ForumPublicProfile;

  @Index()
  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => ForumCategory, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id' })
  category: ForumCategory;

  @Index()
  @Column({
    type: 'enum',
    enum: ForumTopicType,
    default: ForumTopicType.DISCUSSION,
  })
  type: ForumTopicType;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Index()
  @Column({
    type: 'enum',
    enum: ForumContentStatus,
    default: ForumContentStatus.PUBLISHED,
  })
  status: ForumContentStatus;

  @Index()
  @Column({
    type: 'enum',
    enum: ForumTopicVisibility,
    default: ForumTopicVisibility.PUBLIC,
  })
  visibility: ForumTopicVisibility;

  @Column({ name: 'comments_count', type: 'int', default: 0 })
  commentsCount: number;

  @Column({ name: 'reactions_count', type: 'int', default: 0 })
  reactionsCount: number;

  @Column({ name: 'likes_count', type: 'int', default: 0 })
  likesCount: number;

  @Column({ name: 'reports_count', type: 'int', default: 0 })
  reportsCount: number;

  @Column({ name: 'views_count', type: 'int', default: 0 })
  viewsCount: number;

  @Column({ name: 'watchers_count', type: 'int', default: 0 })
  watchersCount: number;

  @Index()
  @Column({
    name: 'lang',
    type: 'varchar',
    length: 16,
    default: 'other',
  })
  lang: string;

  @Index()
  @Column({
    name: 'last_activity_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  lastActivityAt: Date;

  @Column({ name: 'last_comment_author_id', type: 'int', nullable: true })
  lastCommentAuthorId: number | null;

  @Column({ name: 'last_comment_id', type: 'uuid', nullable: true })
  lastCommentId: string | null;

  @Column({ name: 'created_by_admin_id', type: 'int', nullable: true })
  createdByAdminId: number | null;

  @Index()
  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem: boolean;

  @Column({ name: 'is_pinned', type: 'boolean', default: false })
  isPinned: boolean;

  @Column({ name: 'is_locked', type: 'boolean', default: false })
  isLocked: boolean;

  @Column({ name: 'is_featured', type: 'boolean', default: false })
  isFeatured: boolean;

  @Column({ name: 'is_edited', type: 'boolean', default: false })
  isEdited: boolean;

  @Column({ name: 'is_moderation_removed', type: 'boolean', default: false })
  isModerationRemoved: boolean;

  @OneToMany(() => ForumTopicTranslation, (translation) => translation.topic)
  translations: ForumTopicTranslation[];

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

  @Column({ name: 'edited_at', type: 'timestamptz', nullable: true })
  editedAt: Date | null;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
