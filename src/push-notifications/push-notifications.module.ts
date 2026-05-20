import { Module } from '@nestjs/common';
import { PushNotificationsService } from './push-notifications.service';
import { PushNotificationsController } from './push-notifications.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserPushToken } from './entities/user-push-token.entity';
import { DiaryNotificationState } from './entities/diary-notification-state';
import { EntriesStat } from '../diary-statistics/entities/entries-stat.entity';
import { UserSettings } from '../users/entities/user-settings.entity';
import { PushNotificationsCron } from './push-notifications.cron';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserPushToken,
      DiaryNotificationState,
      EntriesStat,
      UserSettings,
    ]),
  ],
  providers: [PushNotificationsService, PushNotificationsCron],
  controllers: [PushNotificationsController],
  exports: [PushNotificationsService],
})
export class PushNotificationsModule {}
