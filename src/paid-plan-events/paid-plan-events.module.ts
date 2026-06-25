import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaidPlanEvent } from './entities/paid-plan-event.entity';
import { PaidPlanEventsService } from './paid-plan-events.service';

@Module({
  imports: [TypeOrmModule.forFeature([PaidPlanEvent])],
  providers: [PaidPlanEventsService],
  exports: [PaidPlanEventsService],
})
export class PaidPlanEventsModule {}
