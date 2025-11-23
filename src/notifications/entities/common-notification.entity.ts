import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CommonNotificationTranslation } from './common-notification-translations.entity';
import { UserReadNotification } from './user-read-notification';

@Entity('common_notifications')
export class CommonNotification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  defaultLocale: string;

  @OneToMany(
    () => CommonNotificationTranslation,
    (translation) => translation.note,
    { onDelete: 'CASCADE' },
  )
  translations: CommonNotificationTranslation[];

  @OneToMany(() => UserReadNotification, (read) => read.notification, {
    onDelete: 'CASCADE',
  })
  readNotifications: UserReadNotification[];

  @CreateDateColumn()
  createdAt: Date;
}
