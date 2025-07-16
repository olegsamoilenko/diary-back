import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DiaryEntry } from './diary.entity';

@Entity('diary_entries_dialogs_with_ai')
export class DiaryEntryDialog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  question: string;

  @Column({ type: 'text' })
  answer: string;

  @ManyToOne(() => DiaryEntry, (entry) => entry.dialogs)
  @JoinColumn()
  entry: DiaryEntry;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
