import { DiaryStatAiInput } from './diary-stat-ai-input';
import {
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';

@Entity('dialogs_stats')
@Index('IDX_dialogs_stats_user_entry', ['user', 'entryId'])
export class DialogsStat extends DiaryStatAiInput {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.dialogsStats, { onDelete: 'SET NULL' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
