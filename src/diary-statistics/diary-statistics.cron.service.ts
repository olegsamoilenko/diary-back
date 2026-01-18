import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TotalEntriesStat } from './entities/total-entries-stat.entity';
import { Repository, Between, LessThan } from 'typeorm';
import { TotalDialogsStat } from './entities/total-dialogs-stat.entity';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { Cron } from '@nestjs/schedule';
import throwError from 'src/common/utils/error';
import { EntriesStat } from './entities/entries-stat.entity';
import { DialogsStat } from './entities/dialogs-stat.entity';

dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class DiaryStatisticsCronService {
  private readonly logger = new Logger(DiaryStatisticsCronService.name);
  constructor(
    @InjectRepository(TotalEntriesStat)
    private totalEntriesStatRepository: Repository<TotalEntriesStat>,
    @InjectRepository(TotalDialogsStat)
    private totalDialogsStatRepository: Repository<TotalDialogsStat>,
    @InjectRepository(EntriesStat)
    private entriesStatRepository: Repository<EntriesStat>,
    @InjectRepository(DialogsStat)
    private dialogsStatRepository: Repository<DialogsStat>,
  ) {}

  private async collectDailyStat(
    sourceRepo: Repository<{ createdAt: Date }>,
    totalRepo: Repository<{ day: string; count: number }>,
  ) {
    const nowKyiv = dayjs().tz('Europe/Kyiv');

    const yesterdayKyiv = nowKyiv.subtract(1, 'day');
    const yesterdayDayStr = yesterdayKyiv.format('YYYY-MM-DD');

    const yesterdayStartKyiv = yesterdayKyiv.startOf('day');
    const yesterdayEndKyiv = yesterdayKyiv.endOf('day');

    const yesterdayStartUtc = yesterdayStartKyiv.utc().toDate();
    const yesterdayEndUtc = yesterdayEndKyiv.utc().toDate();

    const yesterdayCount = await sourceRepo.count({
      where: {
        createdAt: Between(yesterdayStartUtc, yesterdayEndUtc),
      },
    });

    const prevTotal = await totalRepo.findOne({
      where: { day: LessThan(yesterdayDayStr) },
      order: { day: 'DESC' },
    });

    const prevCount = prevTotal?.count ?? 0;
    const cumulative = prevCount + yesterdayCount;

    let totalForYesterday = await totalRepo.findOne({
      where: { day: yesterdayDayStr },
    });

    if (totalForYesterday) {
      totalForYesterday.count = cumulative;
    } else {
      totalForYesterday = totalRepo.create({
        day: yesterdayDayStr,
        count: cumulative,
      });
    }

    await totalRepo.save(totalForYesterday);
  }

  @Cron('05 01 * * *', { timeZone: 'Europe/Kyiv' })
  async collectDailyEntries() {
    try {
      await this.collectDailyStat(
        this.entriesStatRepository,
        this.totalEntriesStatRepository,
      );
    } catch (e) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Failed to collect entries statistics',
        '' + (e instanceof Error ? e.message : 'Unknown error'),
      );
    }
  }

  @Cron('06 01 * * *', { timeZone: 'Europe/Kyiv' })
  async collectDailyDialogs() {
    try {
      await this.collectDailyStat(
        this.dialogsStatRepository,
        this.totalDialogsStatRepository,
      );
    } catch (e) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Failed to collect dialog statistics',
        '' + (e instanceof Error ? e.message : 'Unknown error'),
      );
    }
  }
}
