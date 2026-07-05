import { Module } from '@nestjs/common';
import { GooglePlaySubscriptionsService } from './google-play-subscriptions.service';

@Module({
  providers: [GooglePlaySubscriptionsService],
  exports: [GooglePlaySubscriptionsService],
})
export class GooglePlaySubscriptionsModule {}
