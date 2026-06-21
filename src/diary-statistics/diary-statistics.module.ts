import { Module } from '@nestjs/common';
import { DiaryStatisticsService } from './diary-statistics.service';
import { DiaryStatisticsController } from './diary-statistics.controller';
import { TotalEntriesStat } from './entities/total-entries-stat.entity';
import { TotalDialogsStat } from './entities/total-dialogs-stat.entity';
import { TotalCheckinsStat } from './entities/total-checkins-stat.entity';
import { TotalCheckinDialogsStat } from './entities/total-checkin-dialogs-stat.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiaryStatisticsCronService } from './diary-statistics.cron.service';
import { DialogsStat } from './entities/dialogs-stat.entity';
import { EntriesStat } from './entities/entries-stat.entity';
import { CheckinsStat } from './entities/checkins-stat.entity';
import { CheckinDialogsStat } from './entities/checkin-dialogs-stat.entity';
import { UsersModule } from 'src/users/users.module';
import { UserStatisticsModule } from 'src/user-statistics/user-statistics.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TotalEntriesStat]),
    TypeOrmModule.forFeature([TotalDialogsStat]),
    TypeOrmModule.forFeature([TotalCheckinsStat]),
    TypeOrmModule.forFeature([TotalCheckinDialogsStat]),
    TypeOrmModule.forFeature([DialogsStat]),
    TypeOrmModule.forFeature([EntriesStat]),
    TypeOrmModule.forFeature([CheckinsStat]),
    TypeOrmModule.forFeature([CheckinDialogsStat]),
    UsersModule,
    UserStatisticsModule,
    PushNotificationsModule,
  ],
  controllers: [DiaryStatisticsController],
  providers: [DiaryStatisticsService, DiaryStatisticsCronService],
})
export class DiaryStatisticsModule {}
