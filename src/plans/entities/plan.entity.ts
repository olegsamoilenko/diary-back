import {
  Column,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Payment } from 'src/payments/entities/payment.entity';
import { Plans, PlanStatus, PlanTypes } from '../types/';
import { PlanType } from '../constants';
import { Platform } from '../../common/types/platform';

@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  platform: Platform;

  @Column({ type: 'varchar', nullable: true })
  regionCode: string | null;

  @Column({ type: 'varchar', nullable: true })
  platformPlanId: string | null;

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

  @Column({ type: 'timestamptz' })
  startTime: Date;

  @Column({ type: 'timestamptz', nullable: true })
  expiryTime: Date | null;

  @Column({ nullable: true })
  autoRenewEnabled: boolean;

  @Column({ default: PlanType })
  type: PlanTypes;

  @OneToOne(() => User, (user) => user.plan)
  @JoinColumn()
  user: User;

  @OneToMany(() => Payment, (payment) => payment.plan)
  payments: Payment[];

  @Column()
  planStatus: PlanStatus;

  @Column({ default: false })
  usedTrial: boolean;
}
