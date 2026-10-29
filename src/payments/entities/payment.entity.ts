import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
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

  @Index('uq_payments_order_id', { unique: true })
  @Column({ type: 'varchar', nullable: true })
  orderId: string | null;

  @Column({ type: 'numeric', precision: 30, scale: 9, nullable: true })
  amount: number | string | null;

  @Column()
  currency: string;

  @Column({ type: 'numeric', precision: 30, scale: 9, nullable: true })
  developerRevenue: string | null;

  @Column({ type: 'numeric', precision: 30, scale: 9, nullable: true })
  taxAmount: string | null;

  @Column({ type: 'varchar', nullable: true })
  basePlanId: string | null;

  @Column({ type: 'varchar', nullable: true })
  productId: string | null;

  @Column({ type: 'varchar', nullable: true })
  packageName: string | null;

  @Column({ type: 'boolean', default: false })
  testPurchase: boolean;

  @Column({ type: 'varchar', nullable: true })
  orderState: string | null;

  @Column({ type: 'boolean', default: false })
  financialDetailsPending: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  financialDetailsLastAttemptAt: Date | null;

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
