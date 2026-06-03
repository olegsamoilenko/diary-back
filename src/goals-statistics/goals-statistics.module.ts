import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from 'src/users/users.module';
import { GoalsStat } from './entities/goals-stat.entity';
import { GoalsStatisticsController } from './goals-statistics.controller';
import { GoalsStatisticsService } from './goals-statistics.service';
import { UserStatisticsModule } from '../user-statistics/user-statistics.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GoalsStat]),
    UsersModule,
    UserStatisticsModule,
  ],
  controllers: [GoalsStatisticsController],
  providers: [GoalsStatisticsService],
})
export class GoalsStatisticsModule {}
