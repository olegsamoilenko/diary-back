import { Module } from '@nestjs/common';
import { ReleaseNotificationsService } from './release-notifications.service';
import { CommonNotificationsService } from './common-notifications.service';
import { ReleaseNotificationsController } from './release-notifications.controller';
import { CommonNotificationsController } from './common-notifications.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReleaseNotification } from './entities/release-notification.entity';
import { ReleaseNotificationTranslation } from './entities/release-notification-translations.entity';
import { UserSkippedVersion } from './entities/user-skipped-version.entity';
import { CommonNotification } from './entities/common-notification.entity';
import { CommonNotificationTranslation } from './entities/common-notification-translations.entity';
import { UserReadNotification } from './entities/user-read-notification';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReleaseNotification]),
    TypeOrmModule.forFeature([ReleaseNotificationTranslation]),
    TypeOrmModule.forFeature([UserSkippedVersion]),
    TypeOrmModule.forFeature([CommonNotification]),
    TypeOrmModule.forFeature([CommonNotificationTranslation]),
    TypeOrmModule.forFeature([UserReadNotification]),
  ],
  providers: [ReleaseNotificationsService, CommonNotificationsService],
  controllers: [ReleaseNotificationsController, CommonNotificationsController],
  exports: [ReleaseNotificationsService, CommonNotificationsService],
})
export class NotificationsModule {}
