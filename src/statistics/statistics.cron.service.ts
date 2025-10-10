import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(utc);
dayjs.extend(timezone);

import { PaidUsersStat } from './entities/paid-users-stat.entity';
import { LiteUsersStat } from './entities/lite-users-stat.entity';
import { BaseUsersStat } from './entities/base-users-stat.entity';
import { ProUsersStat } from './entities/pro-users-stat.entity';
import { TotalEntriesStat } from './entities/total-entries-stat.entity';
import { TotalDialogsStat } from './entities/total-dialogs-stat.entity';
import { User } from 'src/users/entities/user.entity';
import { BasePlanIds, PlanStatus } from 'src/plans/types';
import { throwError } from '../common/utils';
import { HttpStatus } from '../common/utils/http-status';
import { DiaryEntry } from '../diary/entities/diary.entity';
import { DiaryEntryDialog } from '../diary/entities/dialog.entity';

const PAID_PLANS = [
  BasePlanIds.LITE_M1,
  BasePlanIds.BASE_M1,
  BasePlanIds.PRO_M1,
] as const;

@Injectable()
export class StatisticsCronService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(PaidUsersStat)
    private readonly paidUsersStatRepository: Repository<PaidUsersStat>,
    @InjectRepository(LiteUsersStat)
    private readonly liteUsersStatRepository: Repository<LiteUsersStat>,
    @InjectRepository(BaseUsersStat)
    private readonly baseUsersStatRepository: Repository<BaseUsersStat>,
    @InjectRepository(ProUsersStat)
    private readonly proUsersStatRepository: Repository<ProUsersStat>,
    @InjectRepository(DiaryEntry)
    private diaryEntriesRepository: Repository<DiaryEntry>,
    @InjectRepository(DiaryEntryDialog)
    private diaryEntryDialogRepository: Repository<DiaryEntryDialog>,
    @InjectRepository(TotalEntriesStat)
    private totalEntriesStatRepository: Repository<TotalEntriesStat>,
    @InjectRepository(TotalDialogsStat)
    private totalDialogsStatRepository: Repository<TotalDialogsStat>,
  ) {}

  @Cron('01 0 * * *', { timeZone: 'Europe/Kyiv' })
  async collectDailyPaidUsers() {
    try {
      const kyivDay = dayjs().tz('Europe/Kyiv').format('YYYY-MM-DD');

      const row = await this.usersRepository
        .createQueryBuilder('u')
        .innerJoin(
          'u.plans',
          'p',
          `
            p.actual = true
            AND p.basePlanId IN (:...paid)
            AND p.planStatus = :active
          `,
          {
            paid: PAID_PLANS,
            active: PlanStatus.ACTIVE,
          },
        )
        .select('COUNT(DISTINCT u.id)', 'count')
        .getRawOne<{ count?: string }>();

      const count = Number(row?.count ?? 0);

      await this.paidUsersStatRepository.upsert(
        { day: kyivDay, count },
        { conflictPaths: ['day'] },
      );
    } catch (e) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Failed to collect daily paid users statistics',
        '' + (e instanceof Error ? e.message : 'Unknown error'),
      );
    }
  }

  @Cron('02 0 * * *', { timeZone: 'Europe/Kyiv' })
  async collectDailyLiteUsers() {
    try {
      const kyivDay = dayjs().tz('Europe/Kyiv').format('YYYY-MM-DD');

      const row = await this.usersRepository
        .createQueryBuilder('u')
        .innerJoin(
          'u.plans',
          'p',
          `
            p.actual = true
            AND p.basePlanId = :lite
            AND p.planStatus = :active
          `,
          {
            lite: BasePlanIds.LITE_M1,
            active: PlanStatus.ACTIVE,
          },
        )
        .select('COUNT(DISTINCT u.id)', 'count')
        .getRawOne<{ count?: string }>();

      const count = Number(row?.count ?? 0);

      await this.liteUsersStatRepository.upsert(
        { day: kyivDay, count },
        { conflictPaths: ['day'] },
      );
    } catch (e) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Failed to collect daily lite users statistics',
        '' + (e instanceof Error ? e.message : 'Unknown error'),
      );
    }
  }

  @Cron('03 0 * * *', { timeZone: 'Europe/Kyiv' })
  async collectDailyBaseUsers() {
    try {
      const kyivDay = dayjs().tz('Europe/Kyiv').format('YYYY-MM-DD');

      const row = await this.usersRepository
        .createQueryBuilder('u')
        .innerJoin(
          'u.plans',
          'p',
          `
            p.actual = true
            AND p.basePlanId = :base
            AND p.planStatus = :active
          `,
          {
            base: BasePlanIds.BASE_M1,
            active: PlanStatus.ACTIVE,
          },
        )
        .select('COUNT(DISTINCT u.id)', 'count')
        .getRawOne<{ count?: string }>();

      const count = Number(row?.count ?? 0);

      await this.baseUsersStatRepository.upsert(
        { day: kyivDay, count },
        { conflictPaths: ['day'] },
      );
    } catch (e) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Failed to collect daily base users statistics',
        '' + (e instanceof Error ? e.message : 'Unknown error'),
      );
    }
  }

  @Cron('04 0 * * *', { timeZone: 'Europe/Kyiv' })
  async collectDailyProUsers() {
    try {
      const kyivDay = dayjs().tz('Europe/Kyiv').format('YYYY-MM-DD');

      const row = await this.usersRepository
        .createQueryBuilder('u')
        .innerJoin(
          'u.plans',
          'p',
          `
            p.actual = true
            AND p.basePlanId = :pro
            AND p.planStatus = :active
          `,
          {
            pro: BasePlanIds.PRO_M1,
            active: PlanStatus.ACTIVE,
          },
        )
        .select('COUNT(DISTINCT u.id)', 'count')
        .getRawOne<{ count?: string }>();

      const count = Number(row?.count ?? 0);

      await this.proUsersStatRepository.upsert(
        { day: kyivDay, count },
        { conflictPaths: ['day'] },
      );
    } catch (e) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Failed to collect daily pro users statistics',
        '' + (e instanceof Error ? e.message : 'Unknown error'),
      );
    }
  }

  @Cron('05 0 * * *', { timeZone: 'Europe/Kyiv' })
  async collectDailyEntries() {
    try {
      const kyivDay = dayjs().tz('Europe/Kyiv').format('YYYY-MM-DD');

      const row = await this.diaryEntriesRepository
        .createQueryBuilder('e')
        .select('COUNT(DISTINCT e.id)', 'count')
        .getRawOne<{ count?: string }>();

      const count = Number(row?.count ?? 0);

      await this.totalEntriesStatRepository.upsert(
        { day: kyivDay, count },
        { conflictPaths: ['day'] },
      );
    } catch (e) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Failed to collect entries statistics',
        '' + (e instanceof Error ? e.message : 'Unknown error'),
      );
    }
  }

  @Cron('06 0 * * *', { timeZone: 'Europe/Kyiv' })
  async collectDailyDialogs() {
    try {
      const kyivDay = dayjs().tz('Europe/Kyiv').format('YYYY-MM-DD');

      const row = await this.diaryEntryDialogRepository
        .createQueryBuilder('d')
        .select('COUNT(DISTINCT d.id)', 'count')
        .getRawOne<{ count?: string }>();

      const count = Number(row?.count ?? 0);

      await this.totalDialogsStatRepository.upsert(
        { day: kyivDay, count },
        { conflictPaths: ['day'] },
      );
    } catch (e) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Failed to collect daily paid users statistics',
        '' + (e instanceof Error ? e.message : 'Unknown error'),
      );
    }
  }
}
