import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import type { CipherBlobV1 } from 'src/kms/types';
import type { MediaMetadata } from './media-policy';

@Entity('ai_media_assets')
@Index('idx_ai_media_owner_created', ['userId', 'createdAt'])
export class AiMediaAsset {
  @PrimaryColumn('uuid') id!: string;
  @Column({ name: 'user_id', type: 'int' }) userId!: number;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
  @Column({ type: 'text' }) hash!: string;
  @Column({ type: 'jsonb' }) metadata!: MediaMetadata;
  @Column({ type: 'text' }) status!:
    | 'generating'
    | 'generation_billing_pending'
    | 'generated'
    | 'generation_failed'
    | 'prepared'
    | 'transcribing'
    | 'billing_pending'
    | 'ready'
    | 'failed';
  @Column({ name: 'encrypted_payload', type: 'jsonb' })
  encryptedPayload!: CipherBlobV1;
  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt!: Date | null;
  // Set only after a replay-capable client confirms a durable local copy.
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
