import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('total_checkin_dialogs_stats')
@Unique(['day'])
export class TotalCheckinDialogsStat {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  day: string;

  @Column({ type: 'int' })
  count: number;
}
