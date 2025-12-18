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
import { UnhelpfulAnswerDescription } from '../types/unhelpfulAnswerDescription';

@Entity('positive_negative_ai_model_answers')
export class PositiveNegativeAiModelAnswer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: ['positive', 'negative'] })
  attitude: 'positive' | 'negative';

  @Column({ type: 'enum', enum: ['comment', 'dialog'] })
  type: string;

  @Column({
    type: 'enum',
    enum: UnhelpfulAnswerDescription,
    array: true,
    nullable: true,
  })
  unhelpfulAnswerDescriptions?: UnhelpfulAnswerDescription[];

  @Column({ type: 'text', nullable: true })
  unhelpfulComment?: string;

  @Column({ type: 'text', nullable: true })
  improvementComment?: string;

  @ManyToOne(() => User, (user) => user.positiveNegativeAiModelAnswers)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  @Column({ type: 'enum', enum: AiModel })
  aiModel: AiModel;

  @CreateDateColumn()
  createdAt: Date;
}
