import {
  Column,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Payment } from 'src/payments/entities/payment.entity';

@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

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

  @OneToOne(() => User, (user) => user.plan)
  user: User;

  @Column({ default: 'active' })
  status: string; // e.g., 'active', 'banned', 'canceled'

  @OneToMany(() => Payment, (payment) => payment.plan)
  payments: Payment[];
}
