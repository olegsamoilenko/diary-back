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
import { AI_MODEL_STORAGE_VALUES, AiModel } from 'src/users/types';

@Entity('token_usage_history')
export class TokenUsageHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: TokenType })
  type: TokenType;

  @Column({ type: 'enum', enum: AI_MODEL_STORAGE_VALUES })
  aiModel: AiModel;

  @Column('int')
  input: number;

  @Column('int', { default: 0 })
  cachedInput: number;

  @Column('int', { default: 0 })
  cacheWriteInput: number;

  @Column('int')
  output: number;

  @Column('int')
  inputCredits: number;

  @Column('int')
  outputCredits: number;

  @Column('int')
  totalCredits: number;

  @Column({ type: 'varchar', nullable: true })
  finishReason: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  traceId: string | null;

  @Column({ type: 'varchar', length: 96, nullable: true })
  operation: string | null;

  @Column({ type: 'boolean', default: false })
  estimated: boolean;

  @Column({ type: 'varchar', nullable: true })
  estimateMethod: string | null;

  @ManyToOne(() => User, (user) => user.tokenUsageHistory)
  @JoinColumn()
  user: User;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
