import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ReleaseNotificationTranslation } from './release-notification-translations.entity';
import { Platform } from 'src/common/types/platform';

@Entity('release_notifications')
export class ReleaseNotification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  defaultLocale: string;

  @Column()
  platform: Platform;

  @Column({ type: 'int' })
  build: number;

  @OneToMany(
    () => ReleaseNotificationTranslation,
    (translation) => translation.note,
    { onDelete: 'CASCADE' },
  )
  translations: ReleaseNotificationTranslation[];

  @Column()
  isUrgent: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
