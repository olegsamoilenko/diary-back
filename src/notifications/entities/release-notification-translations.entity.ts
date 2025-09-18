import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ReleaseNotification } from './release-notification.entity';
import type { Json } from 'src/common/types/json';

@Entity('release_notification_translations')
@Unique('uniq_note_locale', ['note', 'locale'])
export class ReleaseNotificationTranslation {
  @PrimaryGeneratedColumn() id: number;

  @ManyToOne(
    () => ReleaseNotification,
    (notification) => notification.translations,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn()
  note: ReleaseNotification;

  @Column({ length: 10 })
  locale: string;

  @Column({ type: 'text' })
  html: string;

  @Column({ type: 'jsonb', nullable: true })
  docJson?: Json;

  @CreateDateColumn()
  createdAt: Date;
}
