import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Payment } from 'src/payments/entities/payment.entity';
import { Plans, PlanStatus, BasePlanIds, SubscriptionIds } from '../types/';
import { Platform } from '../../common/types/platform';

@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  platform: Platform;

  @Column({ type: 'varchar', nullable: true })
  regionCode: string | null;

  @Column({ type: 'varchar' })
  subscriptionId: SubscriptionIds;

  @Index('idx_plans_baseplan')
  @Column({ type: 'varchar' })
  basePlanId: BasePlanIds;

  @Column()
  name: Plans;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
  price: number;

  @Column({ type: 'varchar', nullable: true })
  currency: string | null;

  @Column('int')
  tokensLimit: number;

  @Column('int', { default: 0 })
  usedTokens: number;

  @Column({ type: 'varchar', nullable: true })
  purchaseToken: string | null;

  @Column({ type: 'varchar', nullable: true })
  linkedPurchaseToken: string | null;

  @Column({ type: 'timestamptz' })
  startTime: Date | string;

  @Index('idx_plans_expiry_time')
  @Column({ type: 'timestamptz', nullable: true })
  expiryTime: Date | string | null;

  @Index('idx_plans_start_payment')
  @Column({ type: 'timestamptz', nullable: true })
  startPayment: Date | string | null;

  @Column({ nullable: true })
  autoRenewEnabled: boolean;

  @ManyToOne(() => User, (user) => user.plans)
  @JoinColumn()
  @Index('idx_plans_user_id')
  user: User;

  @OneToMany(() => Payment, (payment) => payment.plan)
  payments: Payment[];

  @Index('idx_plans_plan_status')
  @Column()
  planStatus: PlanStatus;

  @Index('idx_plans_actual')
  @Column()
  actual: boolean;

  @Column({ default: true })
  usedTrial: boolean;
}
