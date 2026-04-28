import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { ForumReportTargetType } from '../types/forum-report-target-type.enum';
import { ForumReportReason } from '../types/forum-report-reason.enum';
import { ForumReportStatus } from '../types/forum-report-status.enum';

@Entity('forum_reports')
@Index('IDX_forum_reports_target', ['targetType', 'targetId'])
@Index('IDX_forum_reports_reporter_created', ['reporterId', 'createdAt'])
@Index('IDX_forum_reports_status_created', ['status', 'createdAt'])
export class ForumReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'reporter_id', type: 'int' })
  reporterId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporter_id' })
  reporter: User;

  @Column({
    name: 'target_type',
    type: 'enum',
    enum: ForumReportTargetType,
  })
  targetType: ForumReportTargetType;

  @Column({ name: 'target_id', type: 'varchar', length: 80 })
  targetId: string;

  @Column({
    type: 'enum',
    enum: ForumReportReason,
  })
  reason: ForumReportReason;

  @Column({ type: 'text', nullable: true })
  details: string | null;

  @Column({
    type: 'enum',
    enum: ForumReportStatus,
    default: ForumReportStatus.PENDING,
  })
  status: ForumReportStatus;

  @Column({ name: 'reviewed_by', type: 'int', nullable: true })
  reviewedBy: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewed_by' })
  reviewer: User | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;
}
