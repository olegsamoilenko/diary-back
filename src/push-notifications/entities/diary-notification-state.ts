import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('diary_notification_states')
@Index(['userId'], { unique: true })
export class DiaryNotificationState {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'int', unique: true })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    name: 'idle_reminder_enabled',
    type: 'boolean',
    default: true,
  })
  idleReminderEnabled: boolean;

  @Column({
    name: 'idle_reminder_count',
    type: 'int',
    default: 0,
  })
  idleReminderCount: number;

  @Column({
    name: 'last_idle_reminder_sent_at',
    type: 'timestamptz',
    nullable: true,
  })
  lastIdleReminderSentAt: Date | null;

  @Column({
    name: 'last_entry_at_snapshot',
    type: 'timestamptz',
    nullable: true,
  })
  lastEntryAtSnapshot: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
