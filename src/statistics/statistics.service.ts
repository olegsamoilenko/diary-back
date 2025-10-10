import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DiaryEntry } from 'src/diary/entities/diary.entity';
import { In, Repository, DataSource } from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { DiaryEntryDialog } from 'src/diary/entities/dialog.entity';
import type {
  EntryStatisticRow,
  DialogStatisticRow,
  UserStatisticsData,
  Granularity,
  TotalUsersStats,
  TotalUsersStatsByPlan,
} from './types';

import { BasePlanIds, PlanStatus } from 'src/plans/types';
import { PAID_PLANS } from 'src/plans/constants';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(isoWeek);
dayjs.extend(utc);
dayjs.extend(timezone);
import { PaidUsersStat } from './entities/paid-users-stat.entity';
import { LiteUsersStat } from './entities/lite-users-stat.entity';
import { BaseUsersStat } from './entities/base-users-stat.entity';
import { ProUsersStat } from './entities/pro-users-stat.entity';
import { TotalEntriesStat } from './entities/total-entries-stat.entity';
import { TotalDialogsStat } from './entities/total-dialogs-stat.entity';

const NOT_SUBSCRIBED_STATUSES: PlanStatus[] = [
  PlanStatus.INACTIVE,
  PlanStatus.CANCELED,
  PlanStatus.EXPIRED,
  PlanStatus.REFUNDED,
];

type NewUsersPoint = { date: string; count: number };
type NewPaidUsersPoint = {
  date: string;
  lite: number;
  base: number;
  pro: number;
};

type NewEntriesAndDialogsPoint = {
  date: string;
  entries: number;
  dialogs: number;
};

@Injectable()
export class StatisticsService {
  constructor(
    @InjectRepository(DiaryEntry)
    private diaryEntriesRepository: Repository<DiaryEntry>,
    @InjectRepository(DiaryEntryDialog)
    private diaryEntryDialogRepository: Repository<DiaryEntryDialog>,
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
    @InjectRepository(TotalEntriesStat)
    private totalEntriesStatRepository: Repository<TotalEntriesStat>,
    @InjectRepository(TotalDialogsStat)
    private totalDialogsStatRepository: Repository<TotalDialogsStat>,
    private readonly dataSource: DataSource,
  ) {}

  async getUserCount(): Promise<UserStatisticsData> {
    const userStatisticsData: UserStatisticsData = {
      inTrialUsers: 0,
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
      userStatisticsData.pastTrialUsers +
      userStatisticsData.totalPaidUsers +
      userStatisticsData.inactiveUsers;

    return userStatisticsData;
  }

  async getUsersEntries() {
    const entryRows = await this.getEntries();

    const dialogRows = await this.getDialogs();

    type DayAgg = Record<string, { entries: number; dialogs: number }>;
    const perUser = new Map<number, DayAgg>();

    for (const r of entryRows) {
      const uid = Number(r.user_id);
      const key = r.day_key;
      const cnt = Number(r.entries_count);
      if (!perUser.has(uid)) perUser.set(uid, {});
      const m = perUser.get(uid)!;
      if (!m[key]) m[key] = { entries: 0, dialogs: 0 };
      m[key].entries += cnt;
    }

    for (const r of dialogRows) {
      const uid = Number(r.user_id);
      if (!perUser.has(uid)) continue;
      const key = r.day_key;
      const cnt = Number(r.dialogs_count);
      const m = perUser.get(uid)!;
      if (!m[key]) m[key] = { entries: 0, dialogs: 0 };
      m[key].dialogs += cnt;
    }

    const userIds = [...perUser.keys()];
    const users = await this.usersRepository.findBy({ id: In(userIds) });
    const userById = new Map(users.map((u) => [u.id, u]));

    const out = userIds.map((uid) => ({
      user: userById.get(uid)!,
      entries: perUser.get(uid)!,
    }));
    return out;
  }

  async getEntries(): Promise<EntryStatisticRow[]> {
    function startOfUtcNDaysAgo(days = 30) {
      const now = new Date();
      const d = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
      d.setUTCDate(d.getUTCDate() - (days - 1));
      return d;
    }

    const sinceUtc = startOfUtcNDaysAgo(30);
    return await this.diaryEntriesRepository
      .createQueryBuilder('e')
      .select('e.userId', 'user_id')
      .addSelect("(e.createdAt AT TIME ZONE 'UTC')::date", 'day_date') // для групування
      .addSelect(
        "TO_CHAR((e.createdAt AT TIME ZONE 'UTC')::date, 'DD.MM.YYYY')",
        'day_key',
      ) // для ключа
      .addSelect('COUNT(DISTINCT e.id)', 'entries_count')
      .where('e.createdAt >= :since', { since: sinceUtc })
      .andWhere('e.deleted_at IS NULL') // якщо використовуєш soft delete
      .groupBy('e.userId')
      .addGroupBy("(e.createdAt AT TIME ZONE 'UTC')::date")
      .orderBy('e.userId', 'ASC')
      .addOrderBy("(e.createdAt AT TIME ZONE 'UTC')::date", 'ASC')
      .getRawMany();
  }

  async getDialogs(): Promise<DialogStatisticRow[]> {
    function startOfUtcNDaysAgo(days = 30) {
      const now = new Date();
      const d = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
      d.setUTCDate(d.getUTCDate() - (days - 1));
      return d;
    }

    const sinceUtc = startOfUtcNDaysAgo(30);

    return await this.diaryEntryDialogRepository
      .createQueryBuilder('d')
      .innerJoin('d.entry', 'e')
      .select('e.userId', 'user_id')
      .addSelect("(d.createdAt AT TIME ZONE 'UTC')::date", 'day_date')
      .addSelect(
        "TO_CHAR((d.createdAt AT TIME ZONE 'UTC')::date, 'DD.MM.YYYY')",
        'day_key',
      )
      .addSelect('COUNT(DISTINCT d.id)', 'dialogs_count')
      .where('d.createdAt >= :since', { since: sinceUtc })
      .andWhere('e.deleted_at IS NULL')
      .groupBy('e.userId')
      .addGroupBy("(d.createdAt AT TIME ZONE 'UTC')::date")
      .orderBy('e.userId', 'ASC')
      .addOrderBy("(d.createdAt AT TIME ZONE 'UTC')::date", 'ASC')
      .getRawMany();
  }

  async getNewUsersByDates(
    startDate: string,
    endDate: string,
    granularity: Granularity = 'day',
    tz = 'Europe/Kyiv',
  ): Promise<NewUsersPoint[]> {
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
    data: NewUsersPoint[],
    startDate: string,
    endDate: string,
    step: 'day' | 'week' | 'month',
    tz: string,
  ): NewUsersPoint[] {
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

    const out: NewUsersPoint[] = [];
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
  ): Promise<NewPaidUsersPoint[]> {
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
  ): NewPaidUsersPoint[] {
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

    const out: NewPaidUsersPoint[] = [];
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

  async getTotalEntries() {
    return await this.totalEntriesStatRepository.find();
  }

  async getTotalDialogs() {
    return await this.totalDialogsStatRepository.find();
  }

  async getNewEntriesAndDialogsByDates(
    startDate: string,
    endDate: string,
    granularity: Granularity = 'day',
    tz = 'Europe/Kyiv',
  ): Promise<NewEntriesAndDialogsPoint[]> {
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
      FROM diary_entries e
      WHERE e."createdAt" >= $1::date
        AND e."createdAt" <  ($2::date + INTERVAL '1 day')
      GROUP BY 1
    ),
    dialogs_agg AS (
      SELECT
        date_trunc('${cfg.trunc}', (d."createdAt" AT TIME ZONE $3)) AS bucket,
        COUNT(*)::int AS cnt
      FROM diary_entries_dialogs_with_ai d
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

  async getUsersActivityByDates(
    startDate: string,
    endDate: string,
    granularity: Granularity = 'day',
    paidType: 'paid' | 'not-paid' = 'paid',
    tz = 'Europe/Kyiv',
  ): Promise<NewUsersPoint[]> {
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
