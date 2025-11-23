import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

@Entity('pro_users_stats')
@Unique(['day'])
export class ProUsersStat {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  day: string;

  @Column({ type: 'int' })
  count: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
