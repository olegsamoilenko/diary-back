import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type EventLevel = 'info' | 'warn' | 'error';
export type EventKind =
  | 'app'
  | 'ui'
  | 'query'
  | 'mutation'
  | 'perf'
  | 'iap'
  | 'ai'
  | 'error';

@Entity('logs')
export class Log {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Index('app_logs_ts_idx')
  @Column({ type: 'timestamptz' })
  ts!: Date;

  @Index('app_logs_level_idx')
  @Column({ type: 'text' })
  level!: EventLevel;

  @Column({ type: 'text', default: 'frontend' })
  source!: 'frontend' | 'backend';

  @Index('app_logs_kind_idx')
  @Column({ type: 'text' })
  kind!: EventKind;

  @Column({ type: 'text' })
  name!: string;

  @Index('app_logs_user_id_idx')
  @Column({ type: 'int', nullable: true })
  userId!: number | null;

  @Index('app_logs_user_uuid_idx')
  @Column({ type: 'text', nullable: true })
  userUuid!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  device!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  data!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  appData!: Record<string, unknown> | null;

  @Column({ type: 'uuid', nullable: true })
  requestId!: string | null;

  @Column({ type: 'inet', nullable: true })
  ip!: string | null;

  @Column({ type: 'text', nullable: true })
  ua!: string | null;

  @Column({ type: 'text', nullable: true })
  sessionId!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
