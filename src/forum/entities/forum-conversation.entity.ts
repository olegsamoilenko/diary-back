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
import { ForumConversationStatus } from '../types/forum-conversation-status.enum';

@Entity('forum_conversations')
@Unique('UQ_forum_conversations_users', ['userOneId', 'userTwoId'])
@Index('IDX_forum_conversations_user_one_updated', ['userOneId', 'updatedAt'])
@Index('IDX_forum_conversations_user_two_updated', ['userTwoId', 'updatedAt'])
@Index('IDX_forum_conversations_last_message', ['lastMessageAt'])
export class ForumConversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_one_id', type: 'int' })
  userOneId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_one_id' })
  userOne: User;

  @Column({ name: 'user_two_id', type: 'int' })
  userTwoId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_two_id' })
  userTwo: User;

  @Column({
    type: 'enum',
    enum: ForumConversationStatus,
    default: ForumConversationStatus.ACTIVE,
  })
  status: ForumConversationStatus;

  @Column({ name: 'last_message_at', type: 'timestamptz', nullable: true })
  lastMessageAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
