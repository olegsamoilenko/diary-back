import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { MonitoringType } from '../types';

@Entity('user_monitoring')
export class UserMonitoring {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => User, (user) => user.monitoring, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column({ type: 'enum', enum: MonitoringType })
  type: MonitoringType;

  @Column({ type: 'text' })
  description: string;
}
