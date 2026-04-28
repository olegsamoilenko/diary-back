import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { ForumTopic } from './forum-topic.entity';
import { ForumComment } from './forum-comment.entity';

@Entity('forum_topic_read_states')
@Unique('UQ_forum_topic_read_states_user_topic', ['userId', 'topicId'])
@Index(['userId', 'lastReadAt'])
@Index(['topicId', 'lastReadAt'])
export class ForumTopicReadState {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index()
  @Column({ name: 'topic_id', type: 'uuid' })
  topicId: string;

  @ManyToOne(() => ForumTopic, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'topic_id' })
  topic: ForumTopic;

  @Column({ name: 'last_read_at', type: 'timestamptz' })
  lastReadAt: Date;

  @Column({ name: 'last_read_comment_id', type: 'uuid', nullable: true })
  lastReadCommentId: string | null;

  @ManyToOne(() => ForumComment, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'last_read_comment_id' })
  lastReadComment: ForumComment | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
