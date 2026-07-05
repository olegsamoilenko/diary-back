import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import {
  SubscriptionBasePlanId,
  SubscriptionAccessStatus,
  SubscriptionBillingStatus,
  SubscriptionSource,
} from '../types';
import { StoreSubscription } from './store-subscription.entity';

@Entity('user_plan_states')
export class UserPlanState {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index('uq_user_plan_states_user_id', { unique: true })
  @Column()
  userId!: number;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Index('idx_user_plan_states_source')
  @Column({ type: 'varchar' })
  source!: SubscriptionSource;

  @Index('idx_user_plan_states_base_plan_id')
  @Column({ type: 'varchar', nullable: true })
  basePlanId!: SubscriptionBasePlanId | null;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
  price!: number;

  @Column({ type: 'varchar', nullable: true })
  currency!: string | null;

  @Index('idx_user_plan_states_billing_status')
  @Column({ type: 'varchar' })
  billingStatus!: SubscriptionBillingStatus;

  @Index('idx_user_plan_states_access_status')
  @Column({ type: 'varchar' })
  accessStatus!: SubscriptionAccessStatus;

  @Column({ type: 'timestamptz', nullable: true })
  startTime!: Date | string | null;

  @Index('idx_user_plan_states_expiry_time')
  @Column({ type: 'timestamptz', nullable: true })
  expiryTime!: Date | string | null;

  @Column({ type: 'int', default: 0 })
  creditsLimit!: number;

  @Column({ type: 'int', default: 0 })
  usedCredits!: number;

  @Column({ type: 'int', default: 0 })
  inputUsedCredits!: number;

  @Column({ type: 'int', default: 0 })
  outputUsedCredits!: number;

  @Column({ type: 'boolean', default: false })
  useWithoutSubscription!: boolean;

  @Column({ type: 'int', nullable: true })
  currentStoreSubscriptionId!: number | null;

  @OneToOne(() => StoreSubscription, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'currentStoreSubscriptionId' })
  currentStoreSubscription!: StoreSubscription | null;

  @Column({ type: 'int', nullable: true })
  legacyPlanId!: number | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
