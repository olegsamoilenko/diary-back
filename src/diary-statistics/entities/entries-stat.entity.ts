import { DiaryStatAiInput } from './diary-stat-ai-input';
import {
  Column,
  Check,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';

@Entity('entries_stats')
@Check(
  'CHK_entries_stats_planner_type',
  `"plannerType" IN ('goal', 'habit', 'task', 'event')`,
)
@Index('IDX_entries_stats_user_entry', ['user', 'entryId'])
export class EntriesStat extends DiaryStatAiInput {
  @Column({ type: 'boolean', nullable: true })
  hasAiAnalysis: boolean | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  plannerType: 'goal' | 'habit' | 'task' | 'event' | null;

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'int', nullable: true })
  userId: number | null;

  @ManyToOne(() => User, (user) => user.entriesStats, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
