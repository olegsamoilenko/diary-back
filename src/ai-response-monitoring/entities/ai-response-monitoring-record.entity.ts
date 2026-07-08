import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EntryMetrics } from 'src/common/types/metrics';
import { AiResponseMonitoringMode } from '../types/ai-response-monitoring-mode';

@Entity('ai_response_monitoring_records')
@Index('idx_ai_response_monitoring_mode_created_at', ['mode', 'createdAt'])
@Index('idx_ai_response_monitoring_read_created_at', ['isRead', 'createdAt'])
export class AiResponseMonitoringRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 32 })
  mode: AiResponseMonitoringMode;

  @Column({ name: 'ai_model', type: 'varchar', length: 80 })
  aiModel: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  mood: string | null;

  @Column({ name: 'metrics_json', type: 'jsonb', nullable: true })
  metricsJson: EntryMetrics | null;

  @Column({ name: 'entry_text', type: 'text' })
  entryText: string;

  @Column({ name: 'response_text', type: 'text' })
  responseText: string;

  @Column({ name: 'full_response_text', type: 'text', nullable: true })
  fullResponseText: string | null;

  @Column({ name: 'short_response_text', type: 'text', nullable: true })
  shortResponseText: string | null;

  @Column({ name: 'tags_json', type: 'jsonb', nullable: true })
  tagsJson: string[] | null;

  @Column({ name: 'is_read', default: false })
  isRead: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
