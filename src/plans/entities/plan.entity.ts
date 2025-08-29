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

@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: Plans;

  @Column({ type: 'int' })
  price: number;

  @Column('int')
  tokensLimit: number;

  @Column('int', { default: 0 })
  usedTokens: number;

  @Column()
  periodStart: Date;

  @Column()
  periodEnd: Date;

  @Column({ default: PlanType })
  type: PlanTypes;

  @OneToOne(() => User, (user) => user.plan)
  @JoinColumn()
  user: User;

  @OneToMany(() => Payment, (payment) => payment.plan)
  payments: Payment[];

  @Column({ default: PlanStatus.ACTIVE })
  status: PlanStatus;

  @Column({ default: false })
  usedTrial: boolean;
}
