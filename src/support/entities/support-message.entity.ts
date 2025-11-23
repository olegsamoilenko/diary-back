import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SupportMessageCategory, SupportMessageStatus } from '../types';
import { User } from '../../users/entities/user.entity';

@Entity('support_messages')
export class SupportMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'enum', enum: SupportMessageCategory })
  category: SupportMessageCategory;

  @Column({
    type: 'enum',
    enum: SupportMessageStatus,
    default: SupportMessageStatus.NEW,
  })
  status: SupportMessageStatus;

  @ManyToOne(() => User, (user) => user.supportMessages, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn()
  user: User | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt: Date | null;
}
