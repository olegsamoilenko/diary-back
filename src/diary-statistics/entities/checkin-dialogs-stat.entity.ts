import { DiaryStatAiInput } from './diary-stat-ai-input';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';

@Entity('checkin_dialogs_stats')
@Index('IDX_checkin_dialogs_stats_user_entry', ['user', 'entryId'])
export class CheckinDialogsStat extends DiaryStatAiInput {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'int', nullable: true })
  userId: number | null;

  @ManyToOne(() => User, (user) => user.checkinDialogsStats, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    name: 'checkin_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  checkinName: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
