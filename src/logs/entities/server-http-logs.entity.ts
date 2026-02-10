import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ServerLogLevel = 'warn' | 'error';
export type ServerLogKind = 'http';

@Entity('server_http_logs')
export class ServerHttpLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Index('server_http_logs_ts_idx')
  @Column({ type: 'timestamptz' })
  ts!: Date;

  @Index('server_http_logs_level_idx')
  @Column({ type: 'text' })
  level!: ServerLogLevel;

  @Index('server_http_logs_kind_idx')
  @Column({ type: 'text', default: 'http' })
  kind!: ServerLogKind;

  @Index('server_http_logs_status_idx')
  @Column({ type: 'int' })
  status!: number; // 400..599

  @Index('server_http_logs_method_idx')
  @Column({ type: 'text' })
  method!: string; // GET/POST...

  @Index('server_http_logs_path_idx')
  @Column({ type: 'text' })
  path!: string; // без query

  @Column({ type: 'jsonb', nullable: true })
  query!: Record<string, unknown> | null;

  @Column({ type: 'int', nullable: true })
  durationMs!: number | null;

  @Index('server_http_logs_user_id_idx')
  @Column({ type: 'int', nullable: true })
  userId!: number | null;

  @Column({ type: 'text', nullable: true })
  userUuid!: string | null;

  @Index('server_http_logs_request_id_idx')
  @Column({ type: 'uuid', nullable: true })
  requestId!: string | null;

  @Index('server_http_logs_ip_idx')
  @Column({ type: 'inet', nullable: true })
  ip!: string | null;

  @Column({ type: 'text', nullable: true })
  ua!: string | null;

  @Column({ type: 'text', nullable: true })
  origin!: string | null;

  @Column({ type: 'text', nullable: true })
  referer!: string | null;

  @Column({ type: 'text', nullable: true })
  errorName!: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ type: 'text', nullable: true })
  stack!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  meta!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
