import type { CheckinSettings } from '../types/checkin-settings';
import type { MetricTracking } from '../types/metric-tracking';
import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';
import {
  AiModel,
  DEFAULT_AI_MODEL,
  TimeFormat,
  DateFormat,
  Lang,
  Font,
  Theme,
  FirstDayOfWeek,
  ConversationLanguage,
  DiaryTabVariant,
  CalendarIconFutureRange,
} from '../types';
import { Platform } from 'src/common/types/platform';

@Entity('user_settings')
export class UserSettings {
  @Column({ type: 'jsonb', nullable: true })
  checkinSettings: CheckinSettings | null;

  @Column({ type: 'jsonb', nullable: true })
  metricTracking: MetricTracking | null;

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255, default: null })
  theme: Theme;

  @Column({ type: 'varchar', length: 255, default: Font.MANROPE })
  font: Font;

  @Column({ type: 'varchar', length: 255, default: TimeFormat['12_H'] })
  timeFormat: TimeFormat;

  @Column({ type: 'varchar', length: 255, default: DateFormat.DMY })
  dateFormat: DateFormat;

  @Column({ type: 'int', default: 1 })
  firstDayOfWeek: FirstDayOfWeek;

  @Column({ type: 'varchar', length: 255, default: null })
  lang: Lang;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  conversationLanguage: ConversationLanguage;

  @Column({ type: 'varchar', length: 255, default: DEFAULT_AI_MODEL })
  aiModel: AiModel;

  @Column({ type: 'boolean', default: true })
  aiAnalysisEnabledByDefault: boolean;

  // Null preserves the former shared preference on existing profiles.
  @Column({ type: 'boolean', nullable: true, default: null })
  checkinAiAnalysisEnabledByDefault: boolean | null;

  @Column({ type: 'boolean', default: true })
  shortAiReflectionEnabled: boolean;

  @Column({ type: 'varchar', length: 16, default: 'ask' })
  entryMediaAnalysisMode: 'ask' | 'always' | 'never';

  @Column({ type: 'varchar', length: 64, default: null, nullable: true })
  timezone: string | null;

  @Column({ type: 'boolean', default: false })
  pushNotificationsEnabled: boolean;

  @Column({ type: 'boolean', default: true })
  calendarShowEventIcons: boolean;

  @Column({ type: 'boolean', default: true })
  calendarShowGoalIcons: boolean;

  @Column({ type: 'boolean', default: true })
  calendarShowMood: boolean;

  @Column({ type: 'boolean', default: false })
  calendarShowEventIconsPast: boolean;

  @Column({ type: 'boolean', default: false })
  calendarShowGoalIconsPast: boolean;

  @Column({ type: 'varchar', length: 32, default: CalendarIconFutureRange.ALL })
  calendarEventIconsFutureRange: CalendarIconFutureRange;

  @Column({ type: 'varchar', length: 32, default: CalendarIconFutureRange.ALL })
  calendarGoalIconsFutureRange: CalendarIconFutureRange;

  @Column({ type: 'boolean', default: false })
  diaryTabEnabled: boolean;

  @Column({
    type: 'varchar',
    length: 32,
    default: DiaryTabVariant.CALENDAR_ONLY,
  })
  diaryTabVariant: DiaryTabVariant;

  @OneToOne(() => User, (user) => user.settings)
  @JoinColumn()
  user: User;

  @Column({ type: 'int' })
  appBuild: number;

  @Column({ type: 'varchar', length: 100 })
  appVersion: string;

  @Column({ type: 'enum', enum: Platform })
  platform: Platform;

  @Column({ type: 'varchar', length: 100 })
  locale: string;

  @Column({ type: 'varchar', length: 100 })
  model: string;

  @Column({ type: 'varchar', length: 100 })
  osVersion: string;

  @Column({ type: 'varchar', length: 100 })
  osBuildId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  uniqueId: string | null;
}
