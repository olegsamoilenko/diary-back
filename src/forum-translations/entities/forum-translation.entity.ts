import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ForumTranslationTargetType {
  TOPIC_TITLE = 'topic_title',
  TOPIC_CONTENT = 'topic_content',
  COMMENT_CONTENT = 'comment_content',
}

@Entity('forum_translations')
@Index(
  'idx_forum_translations_unique_cache',
  ['targetType', 'targetId', 'targetLang', 'sourceHash'],
  { unique: true },
)
export class ForumTranslation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'target_type',
    type: 'enum',
    enum: ForumTranslationTargetType,
  })
  targetType: ForumTranslationTargetType;

  @Column({ name: 'target_id', type: 'uuid' })
  targetId: string;

  @Column({ name: 'source_lang', type: 'varchar', length: 10, nullable: true })
  sourceLang: string | null;

  @Column({ name: 'target_lang', type: 'varchar', length: 10 })
  targetLang: string;

  @Column({ name: 'source_hash', type: 'varchar', length: 64 })
  sourceHash: string;

  @Column({ name: 'source_text', type: 'text' })
  sourceText: string;

  @Column({ name: 'translated_text', type: 'text' })
  translatedText: string;

  @Column({ name: 'provider', type: 'varchar', length: 30, default: 'google' })
  provider: string;

  @Column({
    name: 'mime_type',
    type: 'varchar',
    length: 30,
    default: 'text/plain',
  })
  mimeType: 'text/plain' | 'text/html';

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
