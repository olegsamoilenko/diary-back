import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Unique,
  OneToMany,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { DiaryEntry } from '../../diary/entities/diary.entity';
import { Plan } from 'src/plans/entities/plan.entity';
import { TokenUsageHistory } from 'src/tokens/entities/tokenUsageHistory.entity';
import { Payment } from 'src/payments/entities/payment.entity';

@Entity()
@Unique(['email'])
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  uuid: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  password?: string;

  @Column({ nullable: true })
  name?: string;

  @Column({ nullable: true, type: 'text' })
  passwordResetToken: string | null;

  @Column({ nullable: true, type: 'text' })
  passwordChangeToken?: string | null;

  @Column({ default: false })
  emailVerified: boolean;

  @Column({ nullable: true, type: 'text' })
  emailVerificationToken: string | null;

  @OneToMany(() => DiaryEntry, (diaryEntry) => diaryEntry.user)
  diaryEntries: DiaryEntry[];

  @OneToOne(() => Plan, (plan) => plan.user)
  @JoinColumn()
  plan: Plan;

  @OneToMany(
    () => TokenUsageHistory,
    (tokenUsageHistory) => tokenUsageHistory.user,
  )
  tokenUsageHistory: TokenUsageHistory[];

  @OneToMany(() => Payment, (payment) => payment.user)
  payments: Payment[];
}
