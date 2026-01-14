import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import {
  Granularity,
  TotalUsersStatsByPlan,
  UserStatisticsData,
  NewPaidUsersStat,
} from './types';
import { BasePlanIds, PlanStatus } from 'src/plans/types';
import { PAID_PLANS } from 'src/plans/constants';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { PaidUsersStat } from './entities/paid-users-stat.entity';
import { LiteUsersStat } from './entities/lite-users-stat.entity';
import { BaseUsersStat } from './entities/base-users-stat.entity';
import { ProUsersStat } from './entities/pro-users-stat.entity';
import { ByDateStats } from 'src/common/types/statistics';

dayjs.extend(isoWeek);
dayjs.extend(utc);
dayjs.extend(timezone);

const NOT_SUBSCRIBED_STATUSES: PlanStatus[] = [
  PlanStatus.INACTIVE,
  PlanStatus.CANCELED,
  PlanStatus.EXPIRED,
  PlanStatus.REFUNDED,
];

@Injectable()
export class UserStatisticsService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(PaidUsersStat)
    private paidUsersStatRepository: Repository<PaidUsersStat>,
    @InjectRepository(LiteUsersStat)
    private liteUsersStatRepository: Repository<LiteUsersStat>,
    @InjectRepository(BaseUsersStat)
    private baseUsersStatRepository: Repository<BaseUsersStat>,
    @InjectRepository(ProUsersStat)
    private proUsersStatRepository: Repository<ProUsersStat>,
  ) {}

  async getUserCount(): Promise<UserStatisticsData> {
    const userStatisticsData: UserStatisticsData = {
      inTrialUsers: 0,
      usersWithoutPlan: 0,
      pastTrialUsers: 0,
      liteUsers: 0,
      baseUsers: 0,
      proUsers: 0,
      totalPaidUsers: 0,
      inactiveUsers: 0,
      totalUsers: 0,
    };

    const inTrialUsers = await this.usersRepository
      .createQueryBuilder('u')
      .innerJoin(
        'u.plans',
        'p',
        `
      p.actual = true
      AND p.basePlanId = :start
      AND (p.expiryTime IS NULL OR p.expiryTime > NOW())
    `,
        { start: BasePlanIds.START },
      )
      .select('COUNT(DISTINCT u.id)', 'count')
      .getRawOne<{ count: string }>();

    userStatisticsData.inTrialUsers = Number(inTrialUsers?.count) || 0;

    const usersWithoutPlan = await this.usersRepository
      .createQueryBuilder('u')
      .leftJoin('u.plans', 'p')
      .where('p.id IS NULL')
      .select('COUNT(DISTINCT u.id)', 'count')
      .getRawOne<{ count: string }>();

    userStatisticsData.usersWithoutPlan = Number(usersWithoutPlan?.count) || 0;

    const pastTrialUsers = await this.usersRepository
      .createQueryBuilder('u')
      .innerJoin(
        'u.plans',
        'p',
        `
      p.actual = true
      AND p.basePlanId = :start
      AND (p.expiryTime IS NULL OR p.expiryTime < NOW())
    `,
        { start: BasePlanIds.START },
      )
      .select('COUNT(DISTINCT u.id)', 'count')
      .getRawOne<{ count: string }>();

    userStatisticsData.pastTrialUsers = Number(pastTrialUsers?.count) || 0;

    const liteUsers = await this.usersRepository
      .createQueryBuilder('u')
      .innerJoin(
        'u.plans',
        'p',
        `
      p.actual = true
      AND p.basePlanId = :lite
      AND p.planStatus = :active
    `,
        { lite: BasePlanIds.LITE_M1, active: PlanStatus.ACTIVE },
      )
      .select('COUNT(DISTINCT u.id)', 'count')
      .getRawOne<{ count: string }>();

    userStatisticsData.liteUsers = Number(liteUsers?.count) || 0;

    const baseUsers = await this.usersRepository
      .createQueryBuilder('u')
      .innerJoin(
        'u.plans',
        'p',
        `
      p.actual = true
      AND p.basePlanId = :base
      AND p.planStatus = :active
    `,
        { base: BasePlanIds.BASE_M1, active: PlanStatus.ACTIVE },
      )
      .select('COUNT(DISTINCT u.id)', 'count')
      .getRawOne<{ count: string }>();

    userStatisticsData.baseUsers = Number(baseUsers?.count) || 0;

    const proUsers = await this.usersRepository
      .createQueryBuilder('u')
      .innerJoin(
        'u.plans',
        'p',
        `
      p.actual = true
      AND p.basePlanId = :pro
      AND p.planStatus = :active
    `,
        { pro: BasePlanIds.PRO_M1, active: PlanStatus.ACTIVE },
      )
      .select('COUNT(DISTINCT u.id)', 'count')
      .getRawOne<{ count: string }>();

    userStatisticsData.proUsers = Number(proUsers?.count) || 0;

    const inactiveUsers = await this.usersRepository
      .createQueryBuilder('u')
      .innerJoin(
        'u.plans',
        'p',
        `
      p.actual = true
      AND p.basePlanId IN (:...paid)
      AND p.planStatus IN (:...notSub)
    `,
        { paid: PAID_PLANS, notSub: NOT_SUBSCRIBED_STATUSES },
      )
      .select('COUNT(DISTINCT u.id)', 'count')
      .getRawOne<{ count: string }>();

    userStatisticsData.inactiveUsers = Number(inactiveUsers?.count) || 0;

    userStatisticsData.totalPaidUsers =
      userStatisticsData.liteUsers +
      userStatisticsData.baseUsers +
      userStatisticsData.proUsers;
    userStatisticsData.totalUsers =
      userStatisticsData.inTrialUsers +
      userStatisticsData.usersWithoutPlan +
      userStatisticsData.pastTrialUsers +
      userStatisticsData.totalPaidUsers +
      userStatisticsData.inactiveUsers;

    return userStatisticsData;
  }

  async getNewUsersByDates(
    startDate: string,
    endDate: string,
    granularity: Granularity = 'day',
    tz = 'Europe/Kyiv',
  ): Promise<ByDateStats[]> {
    const endPlus1 = dayjs(endDate).add(1, 'day').format('YYYY-MM-DD');

    let truncUnit: 'day' | 'week' | 'month';
    let outFormat: string;
    let step: 'day' | 'week' | 'month';

    switch (granularity) {
      case 'day':
        truncUnit = 'day';
        outFormat = 'YYYY-MM-DD';
        step = 'day';
        break;
      case 'week':
        truncUnit = 'week';
        outFormat = 'IYYY-IW';
        step = 'week';
        break;
      case 'month':
        truncUnit = 'month';
        outFormat = 'YYYY-MM';
        step = 'month';
        break;
    }

    const rows = await this.usersRepository
      .createQueryBuilder('u')
      .select(
        `to_char(date_trunc('${truncUnit}', (u."createdAt" AT TIME ZONE :tz)), '${outFormat}')`,
        'bucket',
      )
      .addSelect('COUNT(*)::int', 'count')
      .where(`u."createdAt" >= :start AND u."createdAt" < :endPlus1`, {
        start: startDate,
        endPlus1,
      })
      .groupBy('bucket')
      .orderBy('bucket', 'ASC')
      .setParameters({ tz })
      .getRawMany<{ bucket: string; count: number }>();

    const filled = this.fillMissingBuckets(
      rows.map((r) => ({
        date:
          granularity === 'week'
            ? this.weekKeyToRangeLabel(r.bucket)
            : r.bucket,
        count: r.count,
      })),
      startDate,
      endDate,
      step,
      tz,
    );

    return filled.map((r) => ({ date: r.date, count: Number(r.count) || 0 }));
  }

  private fillMissingBuckets(
    data: ByDateStats[],
    startDate: string,
    endDate: string,
    step: 'day' | 'week' | 'month',
    tz: string,
  ): ByDateStats[] {
    const map = new Map(data.map((d) => [d.date, d.count]));

    let start = dayjs(startDate);
    let end = dayjs(endDate);

    if (step === 'week') {
      start = start.startOf('isoWeek');
      end = end.endOf('isoWeek');
    } else if (step === 'month') {
      start = start.startOf('month');
      end = end.endOf('month');
    }

    const keyOf = (d: dayjs.Dayjs) => {
      if (step === 'day') return d.format('YYYY-MM-DD');
      if (step === 'month') return d.format('YYYY-MM');

      const isoYear = d.isoWeekYear();
      const isoWeekNum = String(d.isoWeek()).padStart(2, '0');
      return this.weekKeyToRangeLabel(`${isoYear}-${isoWeekNum}`);
    };

    const out: ByDateStats[] = [];
    if (step === 'week') {
      let cur = start;
      const endWeekYear = end.isoWeekYear();
      const endWeekNum = end.isoWeek();

      while (
        cur.isoWeekYear() < endWeekYear ||
        (cur.isoWeekYear() === endWeekYear && cur.isoWeek() <= endWeekNum)
      ) {
        const key = keyOf(cur);
        out.push({ date: key, count: map.get(key) ?? 0 });
        cur = cur.add(1, 'week');
      }
      return out;
    }

    let cur = start;
    while (cur.isBefore(end) || cur.isSame(end, step)) {
      const key = keyOf(cur);
      out.push({ date: key, count: map.get(key) ?? 0 });
      cur = cur.add(1, step);
    }
    return out;
  }

  private weekKeyToRangeLabel(weekKey: string, tz = 'Europe/Kyiv') {
    const [yy, ww] = weekKey.split('-').map(Number);
    if (!yy || !ww) throw new Error(`Invalid week key: ${weekKey}`);

    const start = dayjs.tz(`${yy}-01-04`, tz).isoWeek(ww).startOf('isoWeek');
    const end = start.endOf('isoWeek');

    return `${start.format('YYYY-MM-DD')} - ${end.format('YYYY-MM-DD')}`;
  }

  async getNewPaidUsersByDates(
    startDate: string,
    endDate: string,
    granularity: Granularity = 'day',
    tz = 'Europe/Kyiv',
  ): Promise<NewPaidUsersStat[]> {
    const endPlus1 = dayjs(endDate).add(1, 'day').format('YYYY-MM-DD');

    // Налаштування під гранулярність
    const cfg = {
      day: { trunc: 'day', fmt: 'YYYY-MM-DD', step: 'day' as const },
      week: { trunc: 'week', fmt: 'YYYY-MM-DD', step: 'week' as const }, // ключ = понеділок тижня
      month: { trunc: 'month', fmt: 'YYYY-MM', step: 'month' as const },
    }[granularity];

    const rows = await this.usersRepository
      .createQueryBuilder('u')
      .innerJoin('u.plans', 'p', 'p.actual = true')
      .select(
        `to_char(date_trunc('${cfg.trunc}', (p."startPayment" AT TIME ZONE :tz)), '${cfg.fmt}')`,
        'bucket',
      )
      .addSelect(`COUNT(*) FILTER (WHERE p."basePlanId" = :lite)::int`, 'lite')
      .addSelect(`COUNT(*) FILTER (WHERE p."basePlanId" = :base)::int`, 'base')
      .addSelect(`COUNT(*) FILTER (WHERE p."basePlanId" = :pro)::int`, 'pro')
      .where('p."startPayment" IS NOT NULL')
      .andWhere('p."startPayment" >= :start AND p."startPayment" < :endPlus1', {
        start: startDate,
        endPlus1,
      })
      .groupBy('bucket')
      .orderBy('bucket', 'ASC')
      .setParameters({
        tz,
        lite: BasePlanIds.LITE_M1,
        base: BasePlanIds.BASE_M1,
        pro: BasePlanIds.PRO_M1,
      })
      .getRawMany<{
        bucket: string;
        lite: number;
        base: number;
        pro: number;
      }>();

    // Заповнюємо пропуски нулями (для day/week/month)
    const filled = this.fillMissingMulti(
      rows,
      startDate,
      endDate,
      cfg.step,
      cfg.fmt,
      tz,
    );

    return filled;
  }

  private fillMissingMulti(
    data: { bucket: string; lite: number; base: number; pro: number }[],
    startDate: string,
    endDate: string,
    step: 'day' | 'week' | 'month',
    fmt: string,
    tz: string,
  ): NewPaidUsersStat[] {
    const map = new Map<string, { lite: number; base: number; pro: number }>();
    for (const r of data)
      map.set(r.bucket, { lite: r.lite, base: r.base, pro: r.pro });

    let cur = dayjs(startDate);
    let end = dayjs(endDate);
    if (step === 'week') {
      cur = cur.startOf('isoWeek');
      end = end.startOf('isoWeek');
    } else if (step === 'month') {
      cur = cur.startOf('month');
      end = end.startOf('month');
    }

    const out: NewPaidUsersStat[] = [];
    while (cur.isBefore(end) || cur.isSame(end, step)) {
      const key =
        step === 'week'
          ? cur.tz(tz).startOf('isoWeek').format(fmt)
          : cur.tz(tz).format(fmt);

      const v = map.get(key);
      out.push({
        date: key,
        lite: v?.lite ?? 0,
        base: v?.base ?? 0,
        pro: v?.pro ?? 0,
      });
      cur = cur.add(1, step);
    }
    return out;
  }

  async getTotalPaidUsers() {
    return await this.paidUsersStatRepository.find();
  }

  async getPaidUsersByPlan() {
    const liteUsers = await this.liteUsersStatRepository.find();
    const baseUsers = await this.baseUsersStatRepository.find();
    const proUsers = await this.proUsersStatRepository.find();

    const map = new Map<string, { lite: number; base: number; pro: number }>();

    const add = (
      arr: TotalUsersStatsByPlan[],
      key: 'lite' | 'base' | 'pro',
    ) => {
      for (const p of arr ?? []) {
        const day = p.day;
        const curr = map.get(day) ?? { lite: 0, base: 0, pro: 0 };
        curr[key] += Number(p.count) || 0;
        map.set(day, curr);
      }
    };

    add(liteUsers, 'lite');
    add(baseUsers, 'base');
    add(proUsers, 'pro');

    return Array.from(map.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([day, v]) => ({ day, ...v }));
  }

  async getUsersActivityByDates(
    startDate: string,
    endDate: string,
    granularity: Granularity = 'day',
    paidType: 'paid' | 'not-paid' = 'paid',
    tz = 'Europe/Kyiv',
  ): Promise<ByDateStats[]> {
    const endPlus1 = dayjs(endDate).add(1, 'day').format('YYYY-MM-DD');

    let truncUnit: 'day' | 'week' | 'month';
    let outFormat: string;
    let step: 'day' | 'week' | 'month';

    switch (granularity) {
      case 'day':
        truncUnit = 'day';
        outFormat = 'YYYY-MM-DD';
        step = 'day';
        break;
      case 'week':
        truncUnit = 'week';
        outFormat = 'IYYY-IW';
        step = 'week';
        break;
      case 'month':
        truncUnit = 'month';
        outFormat = 'YYYY-MM';
        step = 'month';
        break;
    }

    const condition =
      paidType === 'paid'
        ? 'p.basePlanId IN (:...paid)'
        : 'p.basePlanId = :trial';

    const rows = await this.usersRepository
      .createQueryBuilder('u')
      .innerJoin(
        'u.plans',
        'p',
        `
      p.actual = true
      AND ${condition}
    `,
        { paid: PAID_PLANS, trial: BasePlanIds.START },
      )
      .select(
        `to_char(date_trunc('${truncUnit}', (u."lastActiveAt" AT TIME ZONE :tz)), '${outFormat}')`,
        'bucket',
      )
      .addSelect('COUNT(*)::int', 'count')
      .where(`u."lastActiveAt" >= :start AND u."lastActiveAt" < :endPlus1`, {
        start: startDate,
        endPlus1,
      })
      .groupBy('bucket')
      .orderBy('bucket', 'ASC')
      .setParameters({ tz })
      .getRawMany<{ bucket: string; count: number }>();

    const filled = this.fillMissingBuckets(
      rows.map((r) => ({
        date:
          granularity === 'week'
            ? this.weekKeyToRangeLabel(r.bucket)
            : r.bucket,
        count: r.count,
      })),
      startDate,
      endDate,
      step,
      tz,
    );

    return filled.map((r) => ({ date: r.date, count: Number(r.count) || 0 }));
  }
}
