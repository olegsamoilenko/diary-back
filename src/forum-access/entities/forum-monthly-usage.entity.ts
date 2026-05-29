import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('forum_monthly_usage')
@Unique(['userId', 'period'])
export class ForumMonthlyUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ type: 'varchar', length: 7 })
  period: string;

  @Column({ name: 'topics_created', type: 'int', default: 0 })
  topicsCreated: number;

  @Column({ name: 'comments_created', type: 'int', default: 0 })
  commentsCreated: number;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
