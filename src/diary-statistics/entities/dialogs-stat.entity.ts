import {
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';

@Entity('dialogs_stats')
export class DialogsStat {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.dialogsStats, { onDelete: 'SET NULL' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
