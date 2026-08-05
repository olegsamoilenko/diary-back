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
import { AI_MODEL_STORAGE_VALUES, AiModel } from 'src/users/types';

@Entity('regenerate_ai_model_answers')
export class RegenerateAiModelAnswer {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.regenerateAiModelAnswers)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'enum', enum: AI_MODEL_STORAGE_VALUES })
  model: AiModel;

  @CreateDateColumn()
  createdAt: Date;
}
