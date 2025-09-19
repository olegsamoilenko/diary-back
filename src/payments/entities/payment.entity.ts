import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Plan } from 'src/plans/entities/plan.entity';
import { Platform } from '../../common/types/platform';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  platform: Platform;

  @Column({ type: 'varchar', nullable: true })
  regionCode: string | null;

  @Column({ nullable: true })
  orderId: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  amount: number;

  @Column()
  currency: string;

  @ManyToOne(() => User, (user) => user.payments, { onDelete: 'SET NULL' })
  @JoinColumn()
  user: User;

  @ManyToOne(() => Plan, (plan) => plan.payments, { onDelete: 'SET NULL' })
  @JoinColumn()
  plan: Plan;

  @Column({ nullable: true })
  provider: string;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
