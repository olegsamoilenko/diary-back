import { Column, Entity, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { DiaryEntryDialog } from 'src/diary/entities/dialog.entity';

@Entity('ai_dialog_answers')
export class AIAnswer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  content: string;

  // @OneToOne(() => DiaryEntryDialog, (dialog) => dialog.answer)
  // question: DiaryEntryDialog;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
