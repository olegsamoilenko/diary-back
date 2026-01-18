import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TotalEntriesStat } from './entities/total-entries-stat.entity';
import { TotalDialogsStat } from './entities/total-dialogs-stat.entity';
import { EntriesStat } from './entities/entries-stat.entity';
import { DialogsStat } from './entities/dialogs-stat.entity';
import { UsersService } from 'src/users/users.service';
import { throwError } from '../common/utils';
import { HttpStatus } from '../common/utils/http-status';
import { Granularity } from '../user-statistics/types';
import dayjs from 'dayjs';
import { NewEntriesAndDialogsStat } from './types';

@Injectable()
export class DiaryStatisticsService {
  constructor(
    @InjectRepository(EntriesStat)
    private entriesStatRepository: Repository<EntriesStat>,
    @InjectRepository(DialogsStat)
    private dialogsStatRepository: Repository<DialogsStat>,
    @InjectRepository(TotalEntriesStat)
    private totalEntriesStatRepository: Repository<TotalEntriesStat>,
    @InjectRepository(TotalDialogsStat)
    private totalDialogsStatRepository: Repository<TotalDialogsStat>,
    private usersService: UsersService,
    private readonly dataSource: DataSource,
  ) {}

  async addEntryStat(userId: number) {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User not found',
        'USER_NOT_FOUND',
      );
      return;
    }

    const entryStat = this.entriesStatRepository.create({ user });

    return await this.entriesStatRepository.save(entryStat);
  }

  async addDialogStat(userId: number) {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User not found',
        'USER_NOT_FOUND',
      );
      return;
    }

    const dialogStat = this.dialogsStatRepository.create({ user });

    return await this.dialogsStatRepository.save(dialogStat);
  }

  async getTotalEntriesStat() {
    return await this.totalEntriesStatRepository.find();
  }

  async getTotalDialogsStat() {
    return await this.totalDialogsStatRepository.find();
  }

  async getNewEntriesAndDialogsByDates(
    startDate: string,
    endDate: string,
    granularity: Granularity = 'day',
    tz = 'Europe/Kyiv',
  ): Promise<NewEntriesAndDialogsStat[]> {
    const startDay = dayjs(startDate).tz(tz).format('YYYY-MM-DD');
    const endDay = dayjs(endDate).tz(tz).format('YYYY-MM-DD');

    const cfg = {
      day: { trunc: 'day', step: "interval '1 day'", fmt: 'YYYY-MM-DD' },
      week: { trunc: 'week', step: "interval '1 week'", fmt: 'IYYY-IW' },
      month: { trunc: 'month', step: "interval '1 month'", fmt: 'YYYY-MM' },
    }[granularity];

    const sql = `
    WITH bounds AS (
      SELECT
        date_trunc('${cfg.trunc}', (($1::date)::timestamptz AT TIME ZONE $3)) AS start_bucket,
        date_trunc('${cfg.trunc}', (($2::date)::timestamptz   AT TIME ZONE $3)) AS end_bucket
    ),
    series AS (
      SELECT gs AS bucket
      FROM bounds b,
           generate_series(b.start_bucket, b.end_bucket, ${cfg.step}) AS gs
    ),
    entries_agg AS (
      SELECT
        date_trunc('${cfg.trunc}', (e."createdAt" AT TIME ZONE $3)) AS bucket,
        COUNT(*)::int AS cnt
      FROM entries_stats e
      WHERE e."createdAt" >= $1::date
        AND e."createdAt" <  ($2::date + INTERVAL '1 day')
      GROUP BY 1
    ),
    dialogs_agg AS (
      SELECT
        date_trunc('${cfg.trunc}', (d."createdAt" AT TIME ZONE $3)) AS bucket,
        COUNT(*)::int AS cnt
      FROM dialogs_stats d
      WHERE d."createdAt" >= $1::date
        AND d."createdAt" <  ($2::date + INTERVAL '1 day')
      GROUP BY 1
    )
    SELECT
      to_char(s.bucket, '${cfg.fmt}')              AS date,
      COALESCE(e.cnt, 0)::int                      AS entries,
      COALESCE(di.cnt, 0)::int                     AS dialogs
    FROM series s
    LEFT JOIN entries_agg e ON e.bucket = s.bucket
    LEFT JOIN dialogs_agg di ON di.bucket = s.bucket
    ORDER BY s.bucket ASC;
  `;

    const params: any[] = [startDay, endDay, tz];

    const raw = (await this.dataSource.query(sql, params)) as unknown;
    const rows = raw as Array<{
      date: string;
      entries: number;
      dialogs: number;
    }>;

    return rows;
  }
}
