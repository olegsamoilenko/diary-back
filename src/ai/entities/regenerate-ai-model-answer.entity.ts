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

@Entity('regenerate_ai_model_answers')
export class RegenerateAiModelAnswer {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.regenerateAiModelAnswers)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'enum', enum: AiModel })
  model: AiModel;

  @CreateDateColumn()
  createdAt: Date;
}
