import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import type { PlannerType } from '../planner-statistics.dto';

@Entity('planner_creation_stats')
@Unique('UQ_planner_creation_source', ['userId', 'type', 'entityId'])
@Index('IDX_planner_creation_type_date', ['type', 'createdAt'])
export class PlannerCreationStat {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'int', nullable: true })
  userId: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_planner_creation_user',
  })
  user: User | null;

  @Column({ type: 'varchar', length: 16 })
  type: PlannerType;

  @Column({ name: 'entity_id', type: 'varchar', length: 128, nullable: true })
  entityId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', nullable: true })
  createdAt: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
