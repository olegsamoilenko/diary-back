import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

@Entity('total_dialogs_stats')
@Unique(['day'])
export class TotalDialogsStat {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  day: string;

  @Column({ type: 'int' })
  count: number;
}
