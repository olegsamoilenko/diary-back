import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('token_usage_history')
export class TokenUsageHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.tokenUsageHistory)
  @JoinColumn()
  user: User;

  @Column('int')
  tokensUsed: number;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
