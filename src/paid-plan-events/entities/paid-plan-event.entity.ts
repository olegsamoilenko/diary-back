import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BasePlanIds, PlanStatus } from 'src/plans/types';

export enum PaidPlanEventSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CONFLICT = 'CONFLICT',
}

export enum PaidPlanEventSource {
  FRONTEND_CREATE_SUB = 'FRONTEND_CREATE_SUB',
  GOOGLE_PUBSUB = 'GOOGLE_PUBSUB',
  PLANS_SERVICE = 'PLANS_SERVICE',
  MANUAL_PLAN_CHANGE = 'MANUAL_PLAN_CHANGE',
  UNKNOWN = 'UNKNOWN',
}

@Entity('paid_plan_events')
export class PaidPlanEvent {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Index('paid_plan_events_severity_idx')
  @Column({ type: 'text' })
  severity!: PaidPlanEventSeverity;

  @Index('paid_plan_events_event_type_idx')
  @Column({ type: 'text' })
  eventType!: string;

  @Index('paid_plan_events_source_idx')
  @Column({ type: 'text' })
  source!: PaidPlanEventSource;

  @Index('paid_plan_events_user_id_idx')
  @Column({ type: 'int', nullable: true })
  userId!: number | null;

  @Index('paid_plan_events_plan_id_idx')
  @Column({ type: 'int', nullable: true })
  planId!: number | null;

  @Column({ type: 'int', nullable: true })
  oldPlanId!: number | null;

  @Column({ type: 'int', nullable: true })
  newPlanId!: number | null;

  @Index('paid_plan_events_purchase_token_hash_idx')
  @Column({ type: 'text', nullable: true })
  purchaseTokenHash!: string | null;

  @Column({ type: 'text', nullable: true })
  purchaseTokenSuffix!: string | null;

  @Column({ type: 'text', nullable: true })
  linkedPurchaseTokenHash!: string | null;

  @Column({ type: 'text', nullable: true })
  linkedPurchaseTokenSuffix!: string | null;

  @Index('paid_plan_events_order_id_idx')
  @Column({ type: 'text', nullable: true })
  orderId!: string | null;

  @Column({ type: 'text', nullable: true })
  oldOrderId!: string | null;

  @Index('paid_plan_events_base_plan_id_idx')
  @Column({ type: 'text', nullable: true })
  basePlanId!: BasePlanIds | null;

  @Column({ type: 'text', nullable: true })
  oldBasePlanId!: BasePlanIds | null;

  @Index('paid_plan_events_plan_status_idx')
  @Column({ type: 'text', nullable: true })
  planStatus!: PlanStatus | null;

  @Column({ type: 'text', nullable: true })
  oldPlanStatus!: PlanStatus | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiryTime!: Date | string | null;

  @Column({ type: 'timestamptz', nullable: true })
  oldExpiryTime!: Date | string | null;

  @Column({ type: 'boolean', nullable: true })
  actualBefore!: boolean | null;

  @Column({ type: 'boolean', nullable: true })
  actualAfter!: boolean | null;

  @Column({ type: 'text', nullable: true })
  googleSubscriptionState!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  googleExpiryTime!: Date | string | null;

  @Column({ type: 'text', nullable: true })
  googleBasePlanId!: string | null;

  @Column({ type: 'text', nullable: true })
  googleOrderId!: string | null;

  @Column({ type: 'text', nullable: true })
  message!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
