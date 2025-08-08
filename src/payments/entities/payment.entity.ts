import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Plan } from 'src/plans/entities/plan.entity';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  amount: number;

  @Column()
  currency: string;

  @ManyToOne(() => User, (user) => user.payments)
  user: User;

  @ManyToOne(() => Plan, (plan) => plan.payments)
  plan: Plan;

  @Column({ nullable: true })
  provider: string;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
