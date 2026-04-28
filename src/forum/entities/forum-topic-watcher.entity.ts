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
import { ForumTopicWatchType } from '../types/forum-topic-watch-type.enum';

@Entity('forum_topic_watchers')
@Unique('UQ_forum_topic_watchers_user_topic', ['userId', 'topicId'])
@Index(['userId', 'isMuted'])
@Index(['topicId', 'isMuted'])
export class ForumTopicWatcher {
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

  @Index()
  @Column({
    name: 'watch_type',
    type: 'enum',
    enum: ForumTopicWatchType,
    default: ForumTopicWatchType.MANUAL,
  })
  watchType: ForumTopicWatchType;

  @Index()
  @Column({ name: 'is_muted', type: 'boolean', default: false })
  isMuted: boolean;

  @Column({ name: 'last_read_at', type: 'timestamptz', nullable: true })
  lastReadAt: Date | null;

  @Column({ name: 'last_notified_at', type: 'timestamptz', nullable: true })
  lastNotifiedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
