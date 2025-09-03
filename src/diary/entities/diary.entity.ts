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
import { AiComment } from 'src/ai/entities/ai-comment.entity';
import { DiaryEntryDialog } from 'src/diary/entities/dialog.entity';
import { DiaryEntrySetting } from './setting.entity';
import { CipherBlobV1 } from 'src/kms/types';
import { EntryImage } from './entry-image.entity';

@Entity('diary_entries')
export class DiaryEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', nullable: true })
  title?: string;

  @Column({ type: 'jsonb', nullable: false })
  content: CipherBlobV1;

  @Column({ type: 'text' })
  previewContent: string;

  @Column({ nullable: true })
  mood?: string;

  @Column({ type: 'jsonb', nullable: true })
  prompt?: CipherBlobV1;

  @Column({ type: 'jsonb' })
  tags: string[];

  @OneToMany(() => EntryImage, (img) => img.entry)
  images: EntryImage[];

  @ManyToOne(() => User, (user) => user.diaryEntries)
  user: User;

  @OneToMany(() => DiaryEntryDialog, (dialog) => dialog.entry)
  dialogs: DiaryEntryDialog[];

  @OneToOne(() => AiComment, (comment) => comment.entry)
  aiComment: AiComment;

  @OneToOne(() => DiaryEntrySetting, (setting) => setting.entry)
  settings: DiaryEntrySetting;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  updatedAt?: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  public deletedAt?: Date;
}
