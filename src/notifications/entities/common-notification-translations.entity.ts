import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { CommonNotification } from './common-notification.entity';
import type { Json } from 'src/common/types/json';

@Entity('common_notification_translations')
export class CommonNotificationTranslation {
  @PrimaryGeneratedColumn() id: number;

  @ManyToOne(
    () => CommonNotification,
    (notification) => notification.translations,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn()
  note: CommonNotification;

  @Column({ length: 10 })
  locale: string;

  @Column({ type: 'text' })
  html: string;

  @Column({ type: 'jsonb', nullable: true })
  docJson?: Json;

  @CreateDateColumn()
  createdAt: Date;
}
