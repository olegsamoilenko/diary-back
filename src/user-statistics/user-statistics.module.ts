import { Module } from '@nestjs/common';
import { UserStatisticsService } from './user-statistics.service';
import { UserStatisticsController } from './user-statistics.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/users/entities/user.entity';
import { PaidUsersStat } from './entities/paid-users-stat.entity';
import { LiteUsersStat } from './entities/lite-users-stat.entity';
import { BaseUsersStat } from './entities/base-users-stat.entity';
import { ProUsersStat } from './entities/pro-users-stat.entity';
import { UserStatisticsCronService } from './user-statistics.cron.service';
import { Log } from 'src/logs/entities/log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    TypeOrmModule.forFeature([PaidUsersStat]),
    TypeOrmModule.forFeature([LiteUsersStat]),
    TypeOrmModule.forFeature([BaseUsersStat]),
    TypeOrmModule.forFeature([ProUsersStat]),
    TypeOrmModule.forFeature([Log]),
  ],
  controllers: [UserStatisticsController],
  providers: [UserStatisticsService, UserStatisticsCronService],
})
export class UserStatisticsModule {}
