import { Module } from '@nestjs/common';
import { StatisticsService } from './statistics.service';
import { StatisticsController } from './statistics.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiaryEntry } from 'src/diary/entities/diary.entity';
import { DiaryEntryDialog } from 'src/diary/entities/dialog.entity';
import { User } from 'src/users/entities/user.entity';
import { PaidUsersStat } from './entities/paid-users-stat.entity';
import { LiteUsersStat } from './entities/lite-users-stat.entity';
import { BaseUsersStat } from './entities/base-users-stat.entity';
import { ProUsersStat } from './entities/pro-users-stat.entity';
import { TotalEntriesStat } from './entities/total-entries-stat.entity';
import { TotalDialogsStat } from './entities/total-dialogs-stat.entity';
import { StatisticsCronService } from './statistics.cron.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DiaryEntry]),
    TypeOrmModule.forFeature([DiaryEntryDialog]),
    TypeOrmModule.forFeature([User]),
    TypeOrmModule.forFeature([PaidUsersStat]),
    TypeOrmModule.forFeature([LiteUsersStat]),
    TypeOrmModule.forFeature([BaseUsersStat]),
    TypeOrmModule.forFeature([ProUsersStat]),
    TypeOrmModule.forFeature([TotalEntriesStat]),
    TypeOrmModule.forFeature([TotalDialogsStat]),
  ],
  controllers: [StatisticsController],
  providers: [StatisticsService, StatisticsCronService],
})
export class StatisticsModule {}
