import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('total_checkins_stats')
@Unique(['day'])
export class TotalCheckinsStat {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  day: string;

  @Column({ type: 'int' })
  count: number;
}
