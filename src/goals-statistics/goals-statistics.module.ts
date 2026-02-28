import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from 'src/users/users.module';
import { GoalsStat } from './entities/goals-stat.entity';
import { GoalsStatisticsController } from './goals-statistics.controller';
import { GoalsStatisticsService } from './goals-statistics.service';

@Module({
  imports: [TypeOrmModule.forFeature([GoalsStat]), UsersModule],
  controllers: [GoalsStatisticsController],
  providers: [GoalsStatisticsService],
})
export class GoalsStatisticsModule {}
