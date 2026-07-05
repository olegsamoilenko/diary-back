import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Plan } from 'src/plans/entities/plan.entity';
import { User } from 'src/users/entities/user.entity';
import { StoreSubscription } from './entities/store-subscription.entity';
import { UserPlanState } from './entities/user-plan-state.entity';
import { SubscriptionLegacyMapper } from './subscription-legacy.mapper';
import { SubscriptionsLegacyDryRunService } from './migration/subscriptions-legacy-dry-run.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsMigrationService } from './migration/subscriptions-migration.service';
import { SubscriptionsService } from './subscriptions.service';
import { PaidPlanEventsModule } from 'src/paid-plan-events/paid-plan-events.module';
import { GooglePlaySubscriptionsModule } from 'src/iap/google-play-subscriptions.module';
import { PlansModule } from 'src/plans/plans.module';
import { SubscriptionUsageService } from './subscription-usage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Plan,
      StoreSubscription,
      User,
      UserPlanState,
    ]),
    GooglePlaySubscriptionsModule,
    PaidPlanEventsModule,
    forwardRef(() => PlansModule),
  ],
  providers: [
    SubscriptionLegacyMapper,
    SubscriptionsService,
    SubscriptionUsageService,
    SubscriptionsLegacyDryRunService,
    SubscriptionsMigrationService,
  ],
  controllers: [SubscriptionsController],
  exports: [
    SubscriptionLegacyMapper,
    SubscriptionsService,
    SubscriptionUsageService,
    SubscriptionsLegacyDryRunService,
    SubscriptionsMigrationService,
  ],
})
export class SubscriptionsModule {}
