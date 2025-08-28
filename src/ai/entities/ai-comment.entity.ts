import {
  Column,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DiaryEntry } from 'src/diary/entities/diary.entity';
import { TiktokenModel } from 'tiktoken';
import { CipherBlobV1 } from 'src/kms/types';

@Entity('ai_comments')
export class AiComment {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => DiaryEntry, (diaryEntry) => diaryEntry.aiComment)
  @JoinColumn({ name: 'entry_id' })
  entry: DiaryEntry;

  @Column({ type: 'jsonb', nullable: false })
  content: CipherBlobV1;

  @Column({ type: 'varchar', length: 64, nullable: true })
  aiModel?: TiktokenModel;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  public deletedAt?: Date;
}
