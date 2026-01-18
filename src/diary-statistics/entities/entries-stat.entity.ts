import {
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';

@Entity('entries_stats')
export class EntriesStat {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.entriesStats, { onDelete: 'SET NULL' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
