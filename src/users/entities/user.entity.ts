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
import { UserSettings } from './user-settings.entity';

@Entity('users')
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
  email: string | null;

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

  @Column({ type: 'boolean', default: false })
  isLogged: boolean;

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

  @Column({ nullable: true, type: 'text' })
  deleteAccountVerificationCode: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  newEmail: string | null;

  @Column({ nullable: true, type: 'text' })
  newEmailVerificationCode: string | null;

  @Column({ type: 'bytea', nullable: true })
  dekEncrypted?: Buffer | null;

  @Column({ type: 'int', default: 1 })
  dekVersion!: number;

  @OneToOne(() => UserSettings, (userSettings) => userSettings.user)
  settings: UserSettings;

  @OneToMany(() => DiaryEntry, (diaryEntry) => diaryEntry.user)
  diaryEntries: DiaryEntry[];

  @OneToOne(() => Plan, (plan) => plan.user)
  plan: Plan;

  @OneToOne(() => Salt, (salt) => salt.user)
  salt: Salt;

  @OneToMany(
    () => TokenUsageHistory,
    (tokenUsageHistory) => tokenUsageHistory.user,
  )
  tokenUsageHistory: TokenUsageHistory[];

  @OneToMany(() => Payment, (payment) => payment.user)
  payments: Payment[];

  @Column({
    type: 'timestamptz',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
  })
  lastActiveAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  inactivityWarnedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  scheduledDeletionAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
