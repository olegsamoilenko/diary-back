import { forwardRef, Module } from '@nestjs/common';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Plan } from './entities/plan.entity';
import { UsersModule } from 'src/users/users.module';
import { PlanStatisticsService } from './plan-statistics.service';
import { PlansStatisticsController } from './plan-statistics.controller';
import { PaidPlanEventsModule } from 'src/paid-plan-events/paid-plan-events.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Plan]),
    forwardRef(() => UsersModule),
    PaidPlanEventsModule,
  ],
  providers: [PlansService, PlanStatisticsService],
  controllers: [PlansController, PlansStatisticsController],
  exports: [PlansService],
})
export class PlansModule {}
