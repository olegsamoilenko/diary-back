import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { IsEnum } from 'class-validator';
import { TokenType } from '../types';

@Entity('token_usage_history')
export class TokenUsageHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: TokenType })
  type: TokenType;

  @Column('int')
  income: number;

  @Column('int')
  outcome: number;

  @ManyToOne(() => User, (user) => user.tokenUsageHistory)
  @JoinColumn()
  user: User;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
