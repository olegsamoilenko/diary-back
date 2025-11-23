import { Module } from '@nestjs/common';
import { DiaryStatisticsService } from './diary-statistics.service';
import { DiaryStatisticsController } from './diary-statistics.controller';
import { TotalEntriesStat } from './entities/total-entries-stat.entity';
import { TotalDialogsStat } from './entities/total-dialogs-stat.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiaryStatisticsCronService } from './diary-statistics.cron.service';
import { DialogsStat } from './entities/dialogs-stat';
import { EntriesStat } from './entities/entries-stat';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TotalEntriesStat]),
    TypeOrmModule.forFeature([TotalDialogsStat]),
    TypeOrmModule.forFeature([DialogsStat]),
    TypeOrmModule.forFeature([EntriesStat]),
    UsersModule,
  ],
  controllers: [DiaryStatisticsController],
  providers: [DiaryStatisticsService, DiaryStatisticsCronService],
})
export class DiaryStatisticsModule {}
