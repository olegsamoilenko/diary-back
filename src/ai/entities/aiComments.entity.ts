import {
  Column,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DiaryEntry } from 'src/diary/entities/diary.entity';

const embeddingTransformer = {
  to: (value: number[] | null) => (value ? value.join(',') : null),
  from: (value: string | null) =>
    value ? value.split(',').map((n: string) => Number(n)) : null,
};

@Entity('ai_comments')
export class AiComment {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => DiaryEntry, (diaryEntry) => diaryEntry.aiComment)
  @JoinColumn({ name: 'entry_id' })
  entry: DiaryEntry;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  aiModel?: string;

  @Column({
    type: 'text',
    nullable: true,
    transformer: embeddingTransformer,
  })
  embedding?: number[];

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  public deletedAt?: Date;
}
