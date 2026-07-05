import { Module } from '@nestjs/common';
import { IapService } from './iap.service';
import { IapController } from './iap.controller';
import { PlansModule } from 'src/plans/plans.module';
import { PaymentsModule } from 'src/payments/payments.module';
import { UsersModule } from 'src/users/users.module';
import { AiModule } from 'src/ai/ai.module';
import { PaidPlanEventsModule } from 'src/paid-plan-events/paid-plan-events.module';
import { GooglePlaySubscriptionsModule } from './google-play-subscriptions.module';
import { SubscriptionsModule } from 'src/subscriptions/subscriptions.module';

@Module({
  imports: [
    GooglePlaySubscriptionsModule,
    PlansModule,
    PaymentsModule,
    UsersModule,
    AiModule,
    PaidPlanEventsModule,
    SubscriptionsModule,
  ],
  providers: [IapService],
  exports: [IapService],
  controllers: [IapController],
})
export class IapModule {}
