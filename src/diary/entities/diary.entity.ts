import {
  Column,
  DeleteDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';

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

  @Column({ type: 'integer', nullable: true })
  mood?: number;

  @Column({
    type: 'text',
    nullable: true,
    transformer: embeddingTransformer,
  })
  embedding?: number[];

  @ManyToOne(() => User, (user) => user.diaryEntries)
  user: User;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  updatedAt?: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  public deletedAt?: Date;
}
