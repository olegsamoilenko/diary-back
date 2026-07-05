import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { Platform } from 'src/common/types/platform';
import {
  SubscriptionBasePlanId,
  SubscriptionProductId,
  StoreSubscriptionProvider,
  SubscriptionBillingStatus,
} from '../types';

@Entity('store_subscriptions')
export class StoreSubscription {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index('idx_store_subscriptions_user_id')
  @Column({ nullable: true })
  userId!: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user!: User | null;

  @Index('idx_store_subscriptions_provider')
  @Column({ type: 'varchar' })
  provider!: StoreSubscriptionProvider;

  @Column({ type: 'varchar' })
  platform!: Platform;

  @Column({ type: 'varchar', nullable: true })
  regionCode!: string | null;

  @Column({ type: 'varchar', nullable: true })
  productId!: SubscriptionProductId | null;

  @Index('idx_store_subscriptions_base_plan_id')
  @Column({ type: 'varchar' })
  basePlanId!: SubscriptionBasePlanId;

  @Index('uq_store_subscriptions_purchase_token', { unique: true })
  @Column({ type: 'varchar' })
  purchaseToken!: string;

  @Column({ type: 'varchar', nullable: true })
  linkedPurchaseToken!: string | null;

  @Index('idx_store_subscriptions_last_order_id')
  @Column({ type: 'varchar', nullable: true })
  lastOrderId!: string | null;

  @Index('idx_store_subscriptions_store_status')
  @Column({ type: 'varchar' })
  storeStatus!: SubscriptionBillingStatus;

  @Column({ type: 'timestamptz', nullable: true })
  startTime!: Date | string | null;

  @Index('idx_store_subscriptions_expiry_time')
  @Column({ type: 'timestamptz', nullable: true })
  expiryTime!: Date | string | null;

  @Column({ type: 'boolean', nullable: true })
  autoRenewEnabled!: boolean | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
  price!: number;

  @Column({ type: 'varchar', nullable: true })
  currency!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  rawStoreData!: Record<string, unknown> | null;

  @Column({ type: 'int', nullable: true })
  legacyPlanId!: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
