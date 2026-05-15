import { Module } from '@nestjs/common';
import { PushNotificationsService } from './push-notifications.service';
import { PushNotificationsController } from './push-notifications.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserPushToken } from './entities/user-push-token.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserPushToken])],
  providers: [PushNotificationsService],
  controllers: [PushNotificationsController],
  exports: [PushNotificationsService],
})
export class PushNotificationsModule {}
