import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import {
  AiProvider,
  QualityTier,
  Role,
  Tone,
  Length,
  Depth,
  Structure,
  QuestionRate,
  Directness,
  Humor,
  Sarcasm,
  Emojis,
  Delivery,
  Practicality,
  Mirroring,
  AssumptionCaution,
  Challenge,
  Sensitivity,
  StylePresetId,
  AiPreferences,
  PhraseOfTheDay,
} from '../types';

@Entity('user_ai_preferences')
@Index('idx_uap_provider', ['providerPreference'])
@Index('idx_uap_quality', ['qualityTier'])
@Index('idx_uap_preset', ['preset'])
@Index('idx_uap_role', ['role'])
@Index('idx_uap_tone', ['tone'])
@Index('idx_uap_length', ['length'])
@Index('idx_uap_depth', ['depth'])
@Index('idx_uap_sarcasm', ['sarcasm'])
export class UserAiPreferences {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'user_id', type: 'int', unique: true })
  userId!: number;

  @OneToOne(() => User, (u) => u.aiPreferences, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  // ---- Source JSON (full config)
  @Column({ name: 'prefs_json', type: 'jsonb' })
  prefsJson!: AiPreferences;

  @Column({ name: 'schema_version', type: 'int', default: 1 })
  schemaVersion!: number;

  // ---- Engine fields (analytics-friendly)
  @Column({ name: 'provider_preference', type: 'text', default: 'auto' })
  providerPreference!: AiProvider;

  @Column({ name: 'quality_tier', type: 'text', default: 'auto' })
  qualityTier!: QualityTier;

  @Column({ name: 'separate_profiles_by_mode', type: 'bool', default: false })
  separateProfilesByMode!: boolean;

  // ---- Flattened style fields (main style)
  @Column({ name: 'preset', type: 'text', nullable: true })
  preset!: StylePresetId | null;

  @Column({ name: 'role', type: 'text', default: 'friend' })
  role!: Role;

  @Column({ name: 'tone', type: 'text', default: 'warm' })
  tone!: Tone;

  @Column({ name: 'length', type: 'text', default: 'normal' })
  length!: Length;

  @Column({ name: 'depth', type: 'text', default: 'balanced' })
  depth!: Depth;

  @Column({ name: 'structure', type: 'text', default: 'sections' })
  structure!: Structure;

  @Column({ name: 'questions', type: 'text', default: 'normal' })
  questions!: QuestionRate;

  @Column({ name: 'directness', type: 'text', default: 'balanced' })
  directness!: Directness;

  @Column({ name: 'humor', type: 'text', default: 'light' })
  humor!: Humor;

  @Column({ name: 'sarcasm', type: 'text', default: 'light' })
  sarcasm!: Sarcasm;

  @Column({ name: 'phraseOfTheDay', type: 'text', default: 'on' })
  phraseOfTheDay!: PhraseOfTheDay;

  @Column({ name: 'emojis', type: 'text', default: 'some' })
  emojis!: Emojis;

  @Column({ name: 'delivery', type: 'text', default: 'explanations' })
  delivery!: Delivery;

  @Column({ name: 'practicality', type: 'text', default: 'advice_plus_1_step' })
  practicality!: Practicality;

  @Column({ name: 'mirroring', type: 'text', default: 'normal' })
  mirroring!: Mirroring;

  @Column({ name: 'assumption_caution', type: 'text', default: 'ask' })
  assumptionCaution!: AssumptionCaution;

  @Column({ name: 'challenge', type: 'text', default: 'gentle' })
  challenge!: Challenge;

  @Column({ name: 'sensitivity', type: 'text', default: 'balanced' })
  sensitivity!: Sensitivity;

  // Ritual toggles (separate booleans = easier stats)
  @Column({ name: 'ritual_one_sentence_summary', type: 'bool', default: true })
  ritualOneSentenceSummary!: boolean;

  @Column({ name: 'ritual_one_question_at_end', type: 'bool', default: true })
  ritualOneQuestionAtEnd!: boolean;

  @Column({ name: 'ritual_one_small_step_today', type: 'bool', default: true })
  ritualOneSmallStepToday!: boolean;

  @Column({ name: 'ritual_phrase_of_day', type: 'bool', default: true })
  ritualPhraseOfDay!: boolean;

  @Column({ name: 'ritual_rating_check_in', type: 'bool', default: false })
  ritualRatingCheckIn!: boolean;

  // Versioning for conflict resolution
  @VersionColumn({ name: 'row_version' })
  rowVersion!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
