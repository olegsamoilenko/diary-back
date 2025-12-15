import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { AiModel } from 'src/users/types';

@Entity('positive_negative_ai_model_answers')
export class PositiveNegativeAiModelAnswer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: ['positive', 'negative'] })
  attitude: 'positive' | 'negative';

  @Column({ type: 'text', nullable: true })
  comment: string;

  @ManyToOne(() => User, (user) => user.positiveNegativeAiModelAnswers)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'enum', enum: AiModel })
  model: AiModel;

  @CreateDateColumn()
  createdAt: Date;
}
