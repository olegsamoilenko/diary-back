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
import { ForumCategory } from './forum-category.entity';
import { ForumTopicType } from '../types/forum-topic-type.enum';
import { ForumContentStatus } from '../types/forum-content-status.enum';
import { ForumTopicVisibility } from '../types/forum-topic-visibility.enum';

@Entity('forum_topics')
@Index(['categoryId', 'status', 'lastActivityAt'])
@Index(['authorId', 'createdAt'])
export class ForumTopic {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'author_id', type: 'int' })
  authorId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author: User;

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

  @Column({ name: 'reports_count', type: 'int', default: 0 })
  reportsCount: number;

  @Column({ name: 'views_count', type: 'int', default: 0 })
  viewsCount: number;

  @Column({ name: 'watchers_count', type: 'int', default: 0 })
  watchersCount: number;

  @Index()
  @Column({
    name: 'last_activity_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  lastActivityAt: Date;

  @Column({ name: 'last_comment_id', type: 'uuid', nullable: true })
  lastCommentId: string | null;

  @Column({ name: 'is_pinned', type: 'boolean', default: false })
  isPinned: boolean;

  @Column({ name: 'is_locked', type: 'boolean', default: false })
  isLocked: boolean;

  @Column({ name: 'is_featured', type: 'boolean', default: false })
  isFeatured: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
