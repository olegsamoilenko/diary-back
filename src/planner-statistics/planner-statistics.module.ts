import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlannerCreationStat } from './entities/planner-creation-stat.entity';
import { PlannerStatisticsController } from './planner-statistics.controller';
import { PlannerStatisticsService } from './planner-statistics.service';

@Module({
  imports: [TypeOrmModule.forFeature([PlannerCreationStat])],
  controllers: [PlannerStatisticsController],
  providers: [PlannerStatisticsService],
  exports: [PlannerStatisticsService],
})
export class PlannerStatisticsModule {}
