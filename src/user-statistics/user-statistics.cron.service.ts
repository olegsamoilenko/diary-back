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
import { User } from 'src/users/entities/user.entity';
import { throwError } from '../common/utils';
import { HttpStatus } from '../common/utils/http-status';
import { UserPlanState } from 'src/subscriptions/entities/user-plan-state.entity';
import {
  SubscriptionBasePlanId,
  SubscriptionBillingStatus,
  SubscriptionSource,
} from 'src/subscriptions/types';

const PAID_SOURCES: SubscriptionSource[] = [
  SubscriptionSource.GOOGLE_PLAY,
  SubscriptionSource.APP_STORE,
];

const ACTIVE_PAID_BILLING_STATUSES: SubscriptionBillingStatus[] = [
  SubscriptionBillingStatus.ACTIVE,
  SubscriptionBillingStatus.IN_GRACE,
  SubscriptionBillingStatus.CANCELED,
];

@Injectable()
export class UserStatisticsCronService {
  private readonly logger = new Logger(UserStatisticsCronService.name);
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
  ) {}

  @Cron('01 01 * * *', { timeZone: 'Europe/Kyiv' })
  async collectDailyPaidUsers() {
    try {
      const kyivDay = dayjs().tz('Europe/Kyiv').format('YYYY-MM-DD');

      const row = await this.usersRepository
        .createQueryBuilder('u')
        .innerJoin(
          UserPlanState,
          's',
          `
            s.userId = u.id
            AND s.source IN (:...paidSources)
            AND s.billingStatus IN (:...activeBillingStatuses)
            AND (s.expiryTime IS NULL OR s.expiryTime > NOW())
            AND (s.useWithoutSubscription = false OR s.useWithoutSubscription IS NULL)
          `,
          {
            paidSources: PAID_SOURCES,
            activeBillingStatuses: ACTIVE_PAID_BILLING_STATUSES,
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

  @Cron('02 01 * * *', { timeZone: 'Europe/Kyiv' })
  async collectDailyLiteUsers() {
    try {
      const kyivDay = dayjs().tz('Europe/Kyiv').format('YYYY-MM-DD');

      const row = await this.usersRepository
        .createQueryBuilder('u')
        .innerJoin(
          UserPlanState,
          's',
          `
            s.userId = u.id
            AND s.source IN (:...paidSources)
            AND s.basePlanId = :lite
            AND s.billingStatus IN (:...activeBillingStatuses)
            AND (s.expiryTime IS NULL OR s.expiryTime > NOW())
            AND (s.useWithoutSubscription = false OR s.useWithoutSubscription IS NULL)
          `,
          {
            lite: SubscriptionBasePlanId.LITE_M1,
            paidSources: PAID_SOURCES,
            activeBillingStatuses: ACTIVE_PAID_BILLING_STATUSES,
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

  @Cron('03 01 * * *', { timeZone: 'Europe/Kyiv' })
  async collectDailyBaseUsers() {
    try {
      const kyivDay = dayjs().tz('Europe/Kyiv').format('YYYY-MM-DD');

      const row = await this.usersRepository
        .createQueryBuilder('u')
        .innerJoin(
          UserPlanState,
          's',
          `
            s.userId = u.id
            AND s.source IN (:...paidSources)
            AND s.basePlanId = :base
            AND s.billingStatus IN (:...activeBillingStatuses)
            AND (s.expiryTime IS NULL OR s.expiryTime > NOW())
            AND (s.useWithoutSubscription = false OR s.useWithoutSubscription IS NULL)
          `,
          {
            base: SubscriptionBasePlanId.BASE_M1,
            paidSources: PAID_SOURCES,
            activeBillingStatuses: ACTIVE_PAID_BILLING_STATUSES,
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

  @Cron('04 01 * * *', { timeZone: 'Europe/Kyiv' })
  async collectDailyProUsers() {
    try {
      const kyivDay = dayjs().tz('Europe/Kyiv').format('YYYY-MM-DD');

      const row = await this.usersRepository
        .createQueryBuilder('u')
        .innerJoin(
          UserPlanState,
          's',
          `
            s.userId = u.id
            AND s.source IN (:...paidSources)
            AND s.basePlanId = :pro
            AND s.billingStatus IN (:...activeBillingStatuses)
            AND (s.expiryTime IS NULL OR s.expiryTime > NOW())
            AND (s.useWithoutSubscription = false OR s.useWithoutSubscription IS NULL)
          `,
          {
            pro: SubscriptionBasePlanId.PRO_M1,
            paidSources: PAID_SOURCES,
            activeBillingStatuses: ACTIVE_PAID_BILLING_STATUSES,
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
}
