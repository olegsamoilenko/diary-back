import {
  Column,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { AiComment } from 'src/ai/entities/aiComments.entity';
import { DiaryEntryDialog } from 'src/diary/entities/dialog.entity';
import { DiaryEntrySetting } from './setting.entity';

const embeddingTransformer = {
  to: (value: number[] | null) => (value ? value.join(',') : null),
  from: (value: string | null) =>
    value ? value.split(',').map((n: string) => Number(n)) : null,
};

@Entity('diary_entries')
export class DiaryEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', nullable: true })
  title?: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'text' })
  previewContent: string;

  @Column({ nullable: true })
  mood?: string;

  @Column({
    type: 'text',
    transformer: embeddingTransformer,
    nullable: true,
  })
  embedding: number[];

  @Column({ type: 'jsonb', nullable: true })
  prompt: string;

  @Column({ type: 'jsonb' })
  tags: string[];

  @ManyToOne(() => User, (user) => user.diaryEntries)
  user: User;

  @OneToMany(() => DiaryEntryDialog, (dialog) => dialog.entry)
  dialogs: DiaryEntryDialog[];

  @OneToOne(() => AiComment, (comment) => comment.entry)
  aiComment: AiComment;

  @OneToOne(() => DiaryEntrySetting, (setting) => setting.entry)
  @JoinColumn()
  settings: DiaryEntrySetting;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  updatedAt?: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  public deletedAt?: Date;
}
