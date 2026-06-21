import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';

@Entity('checkins_stats')
export class CheckinsStat {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'int', nullable: true })
  userId: number | null;

  @ManyToOne(() => User, (user) => user.checkinsStats, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'checkin_name', type: 'varchar', length: 255, nullable: true })
  checkinName: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
