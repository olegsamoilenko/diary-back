import {
  CreateDateColumn,
  Entity,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { CommonNotification } from './common-notification.entity';

@Entity('user_read_notifications')
export class UserReadNotification {
  @PrimaryGeneratedColumn() id: number;

  @ManyToOne(() => User, (user) => user.readNotifications, {
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  user: User;

  @ManyToOne(
    () => CommonNotification,
    (notification) => notification.readNotifications,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn()
  notification: CommonNotification;

  @CreateDateColumn() createdAt: Date;
}
