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

@Entity('ai_model_answer_reviews')
export class AiModelAnswerReview {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.aiModelAnswerReview)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  @Column({ type: 'enum', enum: ['comment', 'dialog'] })
  type: string;

  @Column()
  isHelpful: boolean;

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

  @Column({ type: 'enum', enum: AiModel })
  aiModel: AiModel;

  @CreateDateColumn()
  createdAt: Date;
}
