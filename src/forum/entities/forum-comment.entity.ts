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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
