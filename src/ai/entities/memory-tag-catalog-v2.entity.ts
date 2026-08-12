import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { MemoryCapsuleTagType } from '../types/memoryCapsuleV2';

@Entity('memory_tag_catalog_v2')
@Index('idx_memory_tag_catalog_v2_type_status', ['type', 'status'])
export class MemoryTagCatalogV2Entity {
  @PrimaryColumn({ type: 'varchar', length: 120 })
  key: string;

  @Column({ type: 'varchar', length: 24 })
  type: MemoryCapsuleTagType;

  @Column({ type: 'varchar', length: 160 })
  label: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ name: 'aliases_json', type: 'jsonb', default: () => "'[]'::jsonb" })
  aliases: string[];

  @Column({ type: 'varchar', length: 16, default: 'seed' })
  source: 'seed' | 'admin';

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: 'active' | 'merged' | 'archived';

  @Column({
    name: 'canonical_key',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  canonicalKey: string | null;

  @Column({ name: 'usage_count', type: 'int', default: 0 })
  usageCount: number;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
