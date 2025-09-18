import { Module } from '@nestjs/common';
import { ReleaseNotificationsService } from './release-notifications.service';
import { ReleaseNotificationsController } from './release-notifications.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReleaseNotification } from './entities/release-notification.entity';
import { ReleaseNotificationTranslation } from './entities/release-notification-translations.entity';
import { UserSkippedVersion } from './entities/user-skipped-version.entity';
@Module({
  imports: [
    TypeOrmModule.forFeature([ReleaseNotification]),
    TypeOrmModule.forFeature([ReleaseNotificationTranslation]),
    TypeOrmModule.forFeature([UserSkippedVersion]),
  ],
  providers: [ReleaseNotificationsService],
  controllers: [ReleaseNotificationsController],
  exports: [ReleaseNotificationsService],
})
export class NotificationsModule {}
