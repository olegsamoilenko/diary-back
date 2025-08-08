import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DiaryEntry } from './diary.entity';

type BackgroundSettings = {
  id: number;
  type: string;
  value: string;
  url?: string | null;
};

@Entity('diary_entry_settings')
export class DiaryEntrySetting {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'jsonb', nullable: true })
  background: BackgroundSettings;

  @OneToOne(() => DiaryEntry, (entry) => entry.settings)
  @JoinColumn()
  entry: DiaryEntry;
}
