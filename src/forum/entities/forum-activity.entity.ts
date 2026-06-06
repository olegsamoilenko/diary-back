import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';

@Entity('forum_activity')
@Unique('UQ_forum_activity_user_date', ['userId', 'activityDate'])
@Index('IDX_forum_activity_date', ['activityDate'])
export class ForumActivity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'activity_date', type: 'date' })
  activityDate: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
