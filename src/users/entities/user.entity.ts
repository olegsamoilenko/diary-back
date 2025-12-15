import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Unique,
  OneToMany,
  OneToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Plan } from 'src/plans/entities/plan.entity';
import { TokenUsageHistory } from 'src/tokens/entities/tokenUsageHistory.entity';
import { Payment } from 'src/payments/entities/payment.entity';
import { Salt } from 'src/salt/entities/salt.entity';
import { UserSettings } from './user-settings.entity';
import { UserSkippedVersion } from 'src/notifications/entities/user-skipped-version.entity';
import { UserSession } from 'src/auth/entities/user-session.entity';
import { SupportMessage } from 'src/support/entities/support-message.entity';
import { DialogsStat } from '../../diary-statistics/entities/dialogs-stat';
import { EntriesStat } from '../../diary-statistics/entities/entries-stat';
import { UserReadNotification } from 'src/notifications/entities/user-read-notification';
import { AiModelAnswerReview } from 'src/ai/entities/ai-model-answer-review';
import { RegenerateAiModelAnswer } from 'src/ai/entities/regenerate-ai-model-answer.entity';
import { PositiveNegativeAiModelAnswer } from 'src/ai/entities/positive-negative-ai-model-answer.entity';

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

  @Column({ nullable: true, type: 'text' })
  resetPinVerificationCode: string | null;

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

  @OneToMany(() => UserSession, (session) => session.user)
  sessions: UserSession[];

  @OneToMany(() => DialogsStat, (dialog) => dialog.user)
  dialogsStats: DialogsStat[];

  @OneToMany(() => EntriesStat, (entry) => entry.user)
  entriesStats: EntriesStat[];

  @OneToMany(() => Plan, (plan) => plan.user)
  plans: Plan[];

  @OneToMany(() => SupportMessage, (message) => message.user)
  supportMessages: SupportMessage[];

  @OneToOne(() => Salt, (salt) => salt.user)
  salt: Salt;

  @Column({ nullable: true })
  regionCode: string;

  @OneToMany(
    () => TokenUsageHistory,
    (tokenUsageHistory) => tokenUsageHistory.user,
  )
  tokenUsageHistory: TokenUsageHistory[];

  @OneToMany(() => UserSkippedVersion, (version) => version.user)
  skippedVersions: UserSkippedVersion[];

  @OneToMany(() => UserReadNotification, (read) => read.user)
  readNotifications: UserReadNotification[];

  @OneToMany(() => Payment, (payment) => payment.user)
  payments: Payment[];

  @OneToMany(() => AiModelAnswerReview, (review) => review.user)
  aiModelAnswerReview: AiModelAnswerReview[];

  @OneToMany(() => RegenerateAiModelAnswer, (regenerate) => regenerate.user)
  regenerateAiModelAnswers: RegenerateAiModelAnswer[];

  @OneToMany(
    () => PositiveNegativeAiModelAnswer,
    (positiveNegative) => positiveNegative.user,
  )
  positiveNegativeAiModelAnswers: PositiveNegativeAiModelAnswer[];

  @Index('idx_users_last_active_at')
  @Column({
    type: 'timestamptz',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
  })
  lastActiveAt?: Date | null;

  @Index('idx_users_inactivity_warned_at')
  @Column({ type: 'timestamptz', nullable: true })
  inactivityWarnedAt: Date | null;

  @Index('idx_users_scheduled_deletion_at')
  @Column({ type: 'timestamptz', nullable: true })
  scheduledDeletionAt: Date | null;

  @Index('idx_users_created_at')
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
