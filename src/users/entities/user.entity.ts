import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Unique,
  OneToMany,
  OneToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DiaryEntry } from '../../diary/entities/diary.entity';
import { Plan } from 'src/plans/entities/plan.entity';
import { TokenUsageHistory } from 'src/tokens/entities/tokenUsageHistory.entity';
import { Payment } from 'src/payments/entities/payment.entity';
import { Salt } from 'src/salt/entities/salt.entity';

@Entity()
@Unique(['email'])
@Unique(['phone'])
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  uuid: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  hash: string;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  email: string | undefined;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  oauthProvider: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  oauthProviderId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  password: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string;

  @Column({ type: 'boolean', default: false })
  isRegistered: boolean;

  @Column({ nullable: true, type: 'text' })
  passwordResetCode: string | null;

  @Column({ nullable: true, type: 'text' })
  passwordChangeToken?: string | null;

  @Column({ default: false })
  emailVerified: boolean;

  @Column({ nullable: true, type: 'text' })
  emailVerificationCode: string | null;

  @Column({ nullable: true, type: 'text' })
  phoneVerificationCode: string | null;

  @OneToMany(() => DiaryEntry, (diaryEntry) => diaryEntry.user)
  diaryEntries: DiaryEntry[];

  @OneToOne(() => Plan, (plan) => plan.user)
  plan: Plan;

  @OneToOne(() => Salt, (salt) => salt.user)
  salt: Plan;

  @OneToMany(
    () => TokenUsageHistory,
    (tokenUsageHistory) => tokenUsageHistory.user,
  )
  tokenUsageHistory: TokenUsageHistory[];

  @OneToMany(() => Payment, (payment) => payment.user)
  payments: Payment[];

  @Column({ type: 'varchar', length: 255, default: 'light' })
  theme: string;

  @Column({
    type: 'timestamptz',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
  })
  lastActiveAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
