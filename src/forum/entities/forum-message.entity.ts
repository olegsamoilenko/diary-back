// src/forum/entities/forum-message.entity.ts

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
import { ForumConversation } from './forum-conversation.entity';
import { ForumMessageStatus } from '../types/forum-message-status.enum';

@Entity('forum_messages')
@Index('IDX_forum_messages_conversation_created', [
  'conversationId',
  'createdAt',
])
@Index('IDX_forum_messages_recipient_read_created', [
  'recipientId',
  'isRead',
  'createdAt',
])
@Index('IDX_forum_messages_sender_created', ['senderId', 'createdAt'])
export class ForumMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId: string;

  @ManyToOne(() => ForumConversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: ForumConversation;

  @Column({ name: 'sender_id', type: 'int' })
  senderId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sender_id' })
  sender: User;

  @Column({ name: 'recipient_id', type: 'int' })
  recipientId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recipient_id' })
  recipient: User;

  @Column({ type: 'text' })
  content: string;

  @Column({
    type: 'enum',
    enum: ForumMessageStatus,
    default: ForumMessageStatus.SENT,
  })
  status: ForumMessageStatus;

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead: boolean;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
