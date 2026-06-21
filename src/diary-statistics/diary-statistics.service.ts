import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TotalEntriesStat } from './entities/total-entries-stat.entity';
import { TotalDialogsStat } from './entities/total-dialogs-stat.entity';
import { TotalCheckinsStat } from './entities/total-checkins-stat.entity';
import { TotalCheckinDialogsStat } from './entities/total-checkin-dialogs-stat.entity';
import { EntriesStat } from './entities/entries-stat.entity';
import { DialogsStat } from './entities/dialogs-stat.entity';
import { CheckinsStat } from './entities/checkins-stat.entity';
import { CheckinDialogsStat } from './entities/checkin-dialogs-stat.entity';
import { UsersService } from 'src/users/users.service';
import { throwError } from '../common/utils';
import { HttpStatus } from '../common/utils/http-status';
import { Granularity } from '../user-statistics/types';
import dayjs from 'dayjs';
import { NewEntriesAndDialogsStat } from './types';
import { UserStatisticsService } from '../user-statistics/user-statistics.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';

@Injectable()
export class DiaryStatisticsService {
  constructor(
    @InjectRepository(EntriesStat)
    private entriesStatRepository: Repository<EntriesStat>,
    @InjectRepository(DialogsStat)
    private dialogsStatRepository: Repository<DialogsStat>,
    @InjectRepository(CheckinsStat)
    private checkinsStatRepository: Repository<CheckinsStat>,
    @InjectRepository(CheckinDialogsStat)
    private checkinDialogsStatRepository: Repository<CheckinDialogsStat>,
    @InjectRepository(TotalEntriesStat)
    private totalEntriesStatRepository: Repository<TotalEntriesStat>,
    @InjectRepository(TotalDialogsStat)
    private totalDialogsStatRepository: Repository<TotalDialogsStat>,
    @InjectRepository(TotalCheckinsStat)
    private totalCheckinsStatRepository: Repository<TotalCheckinsStat>,
    @InjectRepository(TotalCheckinDialogsStat)
    private totalCheckinDialogsStatRepository: Repository<TotalCheckinDialogsStat>,
    private usersService: UsersService,
    private readonly dataSource: DataSource,
    private readonly userStatisticsService: UserStatisticsService,
    private readonly pushNotificationsService: PushNotificationsService,
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

    await this.userStatisticsService.incrementEntryStat(user.id);

    const entryStat = this.entriesStatRepository.create({ user });

    const savedEntryStat = await this.entriesStatRepository.save(entryStat);

    this.pushNotificationsService
      .markDiaryEntryCreated({
        userId: user.id,
        entryCreatedAt: savedEntryStat.createdAt,
      })
      .catch((err) => {
        console.error('[DiaryNotifications] markDiaryEntryCreated failed', err);
      });

    return savedEntryStat;
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

    await this.userStatisticsService.incrementDialogStat(user.id);

    const dialogStat = this.dialogsStatRepository.create({ user });

    return await this.dialogsStatRepository.save(dialogStat);
  }

  async addCheckinStat(userId: number, checkinName?: string | null) {
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

    await this.userStatisticsService.incrementCheckinStat(user.id);

    const stat = this.checkinsStatRepository.create({
      user,
      checkinName: this.normalizeCheckinName(checkinName),
    });

    return await this.checkinsStatRepository.save(stat);
  }

  async addCheckinDialogStat(userId: number, checkinName?: string | null) {
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

    await this.userStatisticsService.incrementCheckinDialogStat(user.id);

    const stat = this.checkinDialogsStatRepository.create({
      user,
      checkinName: this.normalizeCheckinName(checkinName),
    });

    return await this.checkinDialogsStatRepository.save(stat);
  }

  async getTotalEntriesStat() {
    return await this.totalEntriesStatRepository.find();
  }

  async getTotalDialogsStat() {
    return await this.totalDialogsStatRepository.find();
  }

  async getTotalCheckinsStat() {
    return await this.totalCheckinsStatRepository.find();
  }

  async getTotalCheckinDialogsStat() {
    return await this.totalCheckinDialogsStatRepository.find();
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
    ),
    checkins_agg AS (
      SELECT
        date_trunc('${cfg.trunc}', (c."createdAt" AT TIME ZONE $3)) AS bucket,
        COUNT(*)::int AS cnt
      FROM checkins_stats c
      WHERE c."createdAt" >= $1::date
        AND c."createdAt" <  ($2::date + INTERVAL '1 day')
      GROUP BY 1
    ),
    checkin_dialogs_agg AS (
      SELECT
        date_trunc('${cfg.trunc}', (cd."createdAt" AT TIME ZONE $3)) AS bucket,
        COUNT(*)::int AS cnt
      FROM checkin_dialogs_stats cd
      WHERE cd."createdAt" >= $1::date
        AND cd."createdAt" <  ($2::date + INTERVAL '1 day')
      GROUP BY 1
    )
    SELECT
      to_char(s.bucket, '${cfg.fmt}')              AS date,
      COALESCE(e.cnt, 0)::int                      AS entries,
      COALESCE(di.cnt, 0)::int                     AS dialogs,
      COALESCE(c.cnt, 0)::int                      AS checkins,
      COALESCE(cd.cnt, 0)::int                     AS "checkinDialogs"
    FROM series s
    LEFT JOIN entries_agg e ON e.bucket = s.bucket
    LEFT JOIN dialogs_agg di ON di.bucket = s.bucket
    LEFT JOIN checkins_agg c ON c.bucket = s.bucket
    LEFT JOIN checkin_dialogs_agg cd ON cd.bucket = s.bucket
    ORDER BY s.bucket ASC;
  `;

    const params: any[] = [startDay, endDay, tz];

    const raw = (await this.dataSource.query(sql, params)) as unknown;
    const rows = raw as Array<{
      date: string;
      entries: number;
      dialogs: number;
      checkins: number;
      checkinDialogs: number;
    }>;

    return rows;
  }

  private normalizeCheckinName(checkinName?: string | null) {
    const trimmed = checkinName?.trim();
    return trimmed ? trimmed.slice(0, 255) : null;
  }
}
