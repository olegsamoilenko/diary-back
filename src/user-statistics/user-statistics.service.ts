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
import { UserActivityStats } from './entities/user-activity-stat.entity';
import { ActivityPlanType } from './types/activityPlanType';

dayjs.extend(isoWeek);
dayjs.extend(utc);
dayjs.extend(timezone);

const NOT_SUBSCRIBED_STATUSES: PlanStatus[] = [
  PlanStatus.INACTIVE,
  PlanStatus.CANCELED,
  PlanStatus.EXPIRED,
  PlanStatus.REFUNDED,
];

const SUBSCRIBED_STATUSES: PlanStatus[] = [
  PlanStatus.ACTIVE,
  PlanStatus.TOKEN_EXCEEDED,
  PlanStatus.CREDIT_EXCEEDED,
];

type UserWithForumCounts = User & {
  forumCommentsCount: number;
  forumTopicsCount: number;
};

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
    @InjectRepository(UserActivityStats)
    private userActivityStatsRepository: Repository<UserActivityStats>,
  ) {}

  async getUserCount(): Promise<UserStatisticsData> {
    const userStatisticsData: UserStatisticsData = {
      inTrialUsers: 0,
      usersWithoutPlan: 0,
      usersWithoutSubscription: 0,
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
      .leftJoin('u.plans', 'p', 'p.actual = true')
      .where('p.id IS NULL')
      .andWhere(
        '(u.usesWithoutSubscription = false OR u.usesWithoutSubscription IS NULL)',
      )
      .select('COUNT(DISTINCT u.id)', 'count')
      .getRawOne<{ count: string }>();

    userStatisticsData.usersWithoutPlan = Number(usersWithoutPlan?.count) || 0;

    const usersWithoutSubscription = await this.usersRepository
      .createQueryBuilder('u')
      .leftJoin('u.plans', 'p', 'p.actual = true')
      .where('p.id IS NULL')
      .andWhere('u.usesWithoutSubscription = true')
      .select('COUNT(DISTINCT u.id)', 'count')
      .getRawOne<{ count: string }>();

    userStatisticsData.usersWithoutSubscription =
      Number(usersWithoutSubscription?.count) || 0;

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
      AND p.planStatus IN (:...subscribedStatuses)
    `,
        {
          lite: BasePlanIds.LITE_M1,
          subscribedStatuses: SUBSCRIBED_STATUSES,
        },
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
      AND p.planStatus IN (:...subscribedStatuses)
    `,
        {
          base: BasePlanIds.BASE_M1,
          subscribedStatuses: SUBSCRIBED_STATUSES,
        },
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
      AND p.planStatus IN (:...subscribedStatuses)
    `,
        {
          pro: BasePlanIds.PRO_M1,
          subscribedStatuses: SUBSCRIBED_STATUSES,
        },
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
      userStatisticsData.usersWithoutSubscription +
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
      .addSelect('COUNT(DISTINCT u.id)::int', 'count')
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
      .andWhere(
        `
      (u."lastActiveAt" AT TIME ZONE :tz)::date
      !=
      (u."createdAt" AT TIME ZONE :tz)::date
      `,
      )
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

  async ensureUserActivityStat(
    userId: number,
    date: Date = new Date(),
  ): Promise<UserActivityStats> {
    const day = dayjs(date).format('YYYY-MM-DD');

    let stat = await this.userActivityStatsRepository.findOne({
      where: {
        user: { id: userId },
        day,
      },
      relations: ['user'],
    });

    if (!stat) {
      stat = this.userActivityStatsRepository.create({
        user: { id: userId },
        day,
        entries: 0,
        dialogs: 0,
        checkins: 0,
        checkinDialogs: 0,
        goals: 0,
        comments: 0,
        topics: 0,
      });

      await this.userActivityStatsRepository.save(stat);
    }

    return stat;
  }

  async incrementEntryStat(userId: number) {
    const stat = await this.ensureUserActivityStat(userId);

    await this.userActivityStatsRepository.increment(
      { id: stat.id },
      'entries',
      1,
    );
  }

  async incrementDialogStat(userId: number) {
    const stat = await this.ensureUserActivityStat(userId);

    await this.userActivityStatsRepository.increment(
      { id: stat.id },
      'dialogs',
      1,
    );
  }

  async incrementCheckinStat(userId: number) {
    const stat = await this.ensureUserActivityStat(userId);

    await this.userActivityStatsRepository.increment(
      { id: stat.id },
      'checkins',
      1,
    );
  }

  async incrementCheckinDialogStat(userId: number) {
    const stat = await this.ensureUserActivityStat(userId);

    await this.userActivityStatsRepository.increment(
      { id: stat.id },
      'checkinDialogs',
      1,
    );
  }

  async incrementGoalStat(userId: number) {
    const stat = await this.ensureUserActivityStat(userId);

    await this.userActivityStatsRepository.increment(
      { id: stat.id },
      'goals',
      1,
    );
  }

  async incrementCommentStat(userId: number) {
    const stat = await this.ensureUserActivityStat(userId);

    await this.userActivityStatsRepository.increment(
      { id: stat.id },
      'comments',
      1,
    );
  }

  async incrementTopicStat(userId: number) {
    const stat = await this.ensureUserActivityStat(userId);

    await this.userActivityStatsRepository.increment(
      { id: stat.id },
      'topics',
      1,
    );
  }

  async getUsersActivityStatsByDays(
    startDate: string,
    endDate: string,
    type: ActivityPlanType,
  ): Promise<
    {
      date: string;
      totalUserActivity: number;
      newUserActivity: number;
      oldUserActivity: number;
    }[]
  > {
    const qb = this.userActivityStatsRepository
      .createQueryBuilder('uas')
      .leftJoin('uas.user', 'u')
      .leftJoin('u.plans', 'ap', 'ap.actual = true')
      .select(`to_char(uas.day, 'YYYY.MM.DD')`, 'date')

      .addSelect(`COUNT(DISTINCT uas.userId)::int`, 'totalUserActivity')

      .addSelect(
        `
          COUNT(DISTINCT CASE
            WHEN DATE(u."createdAt" AT TIME ZONE 'UTC') = "uas"."day"
            THEN "uas"."user_id"
          END)::int
          `,
        'newUserActivity',
      )

      .addSelect(
        `
          COUNT(DISTINCT CASE
            WHEN DATE(u."createdAt" AT TIME ZONE 'UTC') != "uas"."day"
            THEN "uas"."user_id"
          END)::int
          `,
        'oldUserActivity',
      )

      .where('uas.day >= :startDate', { startDate })
      .andWhere('uas.day <= :endDate', { endDate });

    if (type === 'inTrial') {
      qb.andWhere('ap.id IS NOT NULL').andWhere(
        'ap.basePlanId = :trialPlanId',
        { trialPlanId: 'start-d7' },
      );
    }

    if (type === 'paid') {
      qb.andWhere('ap.id IS NOT NULL').andWhere(
        'ap.basePlanId != :trialPlanId',
        { trialPlanId: 'start-d7' },
      );
    }

    if (type === 'withoutPlan') {
      qb.andWhere('ap.id IS NULL');
    }

    const rows = await qb
      .groupBy('uas.day')
      .orderBy('uas.day', 'ASC')
      .getRawMany<{
        date: string;
        totalUserActivity: number;
        newUserActivity: number;
        oldUserActivity: number;
      }>();

    return rows.map((r) => ({
      date: r.date,
      totalUserActivity: Number(r.totalUserActivity) || 0,
      newUserActivity: Number(r.newUserActivity) || 0,
      oldUserActivity: Number(r.oldUserActivity) || 0,
    }));
  }

  async getUsersActivityRecords(
    startDate: string,
    endDate: string,
    type: ActivityPlanType,
  ): Promise<any[]> {
    const qb = this.userActivityStatsRepository
      .createQueryBuilder('uas')
      .innerJoinAndSelect('uas.user', 'user')
      .leftJoinAndSelect('user.settings', 'settings')
      .leftJoinAndSelect('user.forumPublicProfile', 'forumPublicProfile')
      .leftJoinAndSelect('user.plans', 'ap', 'ap.actual = true')
      .where('uas.day >= :startDate', { startDate })
      .andWhere('uas.userId IS NOT NULL')
      .andWhere('uas.day <= :endDate', { endDate });

    if (type === 'inTrial') {
      qb.andWhere('ap.id IS NOT NULL').andWhere(
        'ap.basePlanId = :trialPlanId',
        {
          trialPlanId: 'start-d7',
        },
      );
    }

    if (type === 'paid') {
      qb.andWhere('ap.id IS NOT NULL').andWhere(
        'ap.basePlanId != :trialPlanId',
        {
          trialPlanId: 'start-d7',
        },
      );
    }

    if (type === 'withoutPlan') {
      qb.andWhere('ap.id IS NULL');
    }

    const activityRecords = await qb
      .orderBy('uas.day', 'DESC')
      .addOrderBy('uas.id', 'DESC')
      .getMany();

    const userIds = [
      ...new Set(
        activityRecords
          .map((r) => r.userId)
          .filter((id): id is number => typeof id === 'number'),
      ),
    ];

    if (!userIds.length) {
      return activityRecords.map((r) => ({
        ...r,
        user: r.user
          ? {
              ...r.user,
              plan: null,
              plans: undefined,
              goalsStats: [],
              dialogsStats: [],
              entriesStats: [],
              checkinsStats: [],
              checkinDialogsStats: [],
            }
          : null,
      }));
    }

    const usersWithStats = await this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.goalsStats', 'goalsStats')
      .leftJoinAndSelect('user.dialogsStats', 'dialogsStats')
      .leftJoinAndSelect('user.entriesStats', 'entriesStats')
      .leftJoinAndSelect('user.checkinsStats', 'checkinsStats')
      .leftJoinAndSelect('user.checkinDialogsStats', 'checkinDialogsStats')
      .where('user.id IN (:...userIds)', { userIds })
      .getMany();

    const usersStatsMap = new Map(usersWithStats.map((u) => [u.id, u]));

    const usersWithForumStats = await this.usersRepository
      .createQueryBuilder('user')
      .loadRelationCountAndMap('user.forumCommentsCount', 'user.forumComments')
      .loadRelationCountAndMap('user.forumTopicsCount', 'user.forumTopics')
      .where('user.id IN (:...userIds)', { userIds })
      .getMany();

    const usersForumStatsMap = new Map<number, UserWithForumCounts>(
      usersWithForumStats.map((u) => [u.id, u as UserWithForumCounts]),
    );

    return activityRecords.map((r) => {
      const plan = r.user?.plans?.[0] ?? null;
      const userWithStats = r.userId ? usersStatsMap.get(r.userId) : null;
      const userWithForumStats = r.userId
        ? usersForumStatsMap.get(r.userId)
        : null;

      return {
        ...r,
        user: r.user
          ? {
              ...r.user,
              plan,
              plans: undefined,
              goalsStats: userWithStats?.goalsStats ?? [],
              dialogsStats: userWithStats?.dialogsStats ?? [],
              entriesStats: userWithStats?.entriesStats ?? [],
              checkinsStats: userWithStats?.checkinsStats ?? [],
              checkinDialogsStats: userWithStats?.checkinDialogsStats ?? [],
              forumCommentsStats: userWithForumStats?.forumCommentsCount ?? 0,
              forumTopicsStats: userWithForumStats?.forumTopicsCount ?? 0,
            }
          : null,
      };
    });
  }

  async getPaidUsersProfile(page = 1, limit = 20) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Number(limit) || 10);
    const skip = (safePage - 1) * safeLimit;

    const baseQb = this.usersRepository.createQueryBuilder('user').innerJoin(
      'user.plans',
      'plan',
      `
        plan.actual = true
        AND plan.basePlanId IN (:...paidPlans)
        AND plan.planStatus = :activeStatus
      `,
      {
        paidPlans: PAID_PLANS,
        activeStatus: PlanStatus.ACTIVE,
      },
    );

    const total = await baseQb
      .clone()
      .select('COUNT(DISTINCT user.id)', 'count')
      .getRawOne<{ count: string }>();

    const rows = await baseQb
      .clone()
      .select('user.id', 'id')
      .addSelect('plan.startPayment', 'startPayment')
      .orderBy('plan.startPayment', 'DESC', 'NULLS LAST')
      .addOrderBy('user.id', 'DESC')
      .offset(skip)
      .limit(safeLimit)
      .getRawMany<{ id: number }>();

    const userIds = rows.map((r) => r.id);

    if (!userIds.length) {
      return {
        users: [],
        total: Number(total?.count) || 0,
        page: safePage,
        limit: safeLimit,
        pageCount: 0,
      };
    }

    const users = await this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.settings', 'settings')
      .leftJoinAndSelect('user.forumPublicProfile', 'forumPublicProfile')
      .leftJoinAndSelect(
        'user.plans',
        'plan',
        `
        plan.actual = true
        AND plan.basePlanId IN (:...paidPlans)
        AND plan.planStatus = :activeStatus
      `,
        {
          paidPlans: PAID_PLANS,
          activeStatus: PlanStatus.ACTIVE,
        },
      )
      .where('user.id IN (:...userIds)', { userIds })
      .orderBy('plan.startPayment', 'DESC', 'NULLS LAST')
      .addOrderBy('user.id', 'DESC')
      .getMany();

    const totalCount = Number(total?.count) || 0;

    return {
      users: users.map((user) => ({
        ...user,
        plan: user.plans?.[0] ?? null,
        plans: undefined,
      })),
      total: totalCount,
      page: safePage,
      limit: safeLimit,
      pageCount: Math.ceil(totalCount / safeLimit),
    };
  }

  async seedUsersActivityStats() {
    const userIds = [
      1, 2, 10, 21, 13, 11, 12, 9, 15, 5, 6, 7, 8, 16, 17, 18, 43, 42, 56, 60,
      57, 61, 35, 50, 62, 63, 64, 54, 45, 46, 65, 24, 68,
    ];

    const today = dayjs().startOf('day');
    const rows: {
      userId: number;
      day: string;
      entries: number;
      dialogs: number;
      checkins: number;
      checkinDialogs: number;
    }[] = [];

    for (let dayOffset = 9; dayOffset >= 0; dayOffset--) {
      const day = today.subtract(dayOffset, 'day').format('YYYY-MM-DD');

      for (const userId of userIds) {
        const shouldBeActive = Math.random() < 0.55;
        if (!shouldBeActive) continue;

        rows.push({
          userId,
          day,
          entries: Math.random() < 0.35 ? Math.floor(Math.random() * 3) + 1 : 0,
          dialogs: Math.random() < 0.45 ? Math.floor(Math.random() * 5) + 1 : 0,
          checkins: Math.random() < 0.3 ? Math.floor(Math.random() * 2) + 1 : 0,
          checkinDialogs:
            Math.random() < 0.2 ? Math.floor(Math.random() * 3) + 1 : 0,
        });
      }
    }

    if (rows.length > 0) {
      await this.userActivityStatsRepository
        .createQueryBuilder()
        .insert()
        .into(UserActivityStats)
        .values(rows)
        .orUpdate(
          ['entries', 'dialogs', 'checkins', 'checkinDialogs', 'updatedAt'],
          ['user_id', 'day'],
        )
        .execute();
    }

    return {
      days: 10,
      users: userIds.length,
      insertedOrUpdated: rows.length,
    };
  }
}
