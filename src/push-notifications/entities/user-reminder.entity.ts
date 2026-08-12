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

export type UserReminderSourceType =
  | 'entry'
  | 'checkin'
  | 'entry_dialog'
  | 'checkin_dialog';

export type UserReminderStatus =
  | 'pending'
  | 'processing'
  | 'sent'
  | 'cancelled'
  | 'failed';

@Entity('user_reminders')
@Index(['userId', 'reminderKey'], { unique: true })
@Index(['status', 'scheduledAt'])
export class UserReminder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'reminder_key', type: 'varchar', length: 255 })
  reminderKey: string;

  @Column({ name: 'source_type', type: 'varchar', length: 32 })
  sourceType: UserReminderSourceType;

  @Column({ name: 'source_id', type: 'varchar', length: 128 })
  sourceId: string;

  @Column({ name: 'source_date', type: 'date', nullable: true })
  sourceDate: string | null;

  @Column({
    name: 'source_entry_kind',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  sourceEntryKind: string | null;

  @Column({ type: 'varchar', length: 160, default: 'Nemory' })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'scheduled_at', type: 'timestamptz' })
  scheduledAt: Date;

  @Column({ name: 'local_date', type: 'date' })
  localDate: string;

  @Column({ name: 'local_time', type: 'varchar', length: 5 })
  localTime: string;

  @Column({ type: 'varchar', length: 64 })
  timezone: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: UserReminderStatus;

  @Column({
    name: 'local_notification_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  localNotificationId: string | null;

  @Column({ name: 'local_scheduled_at', type: 'timestamptz', nullable: true })
  localScheduledAt: Date | null;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt: Date | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
