import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DiaryEntry } from './diary.entity';
import { CipherBlobV1 } from 'src/kms/types';

@Entity('diary_entries_dialogs_with_ai')
export class DiaryEntryDialog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  uuid: string;

  @Column({ type: 'jsonb', nullable: false })
  question: CipherBlobV1;

  @Column({ type: 'jsonb', nullable: false })
  answer: CipherBlobV1;

  @ManyToOne(() => DiaryEntry, (entry) => entry.dialogs)
  @JoinColumn()
  entry: DiaryEntry;

  @Column({ type: 'boolean', default: false })
  loading: boolean;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
