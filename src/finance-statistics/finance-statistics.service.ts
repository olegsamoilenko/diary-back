import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Payment } from 'src/payments/entities/payment.entity';
import { TokenUsageHistory } from 'src/tokens/entities/token-usage-history.entity';

import { FxRatesService } from './fx-rates.service';
import { GetFinanceStatisticsQuery } from './dto/get-finance-statistics.query';
import { FinancePeriod } from './types';

type CommonPoint = { day: string; revenue: number; expenses: number };

@Injectable()
export class FinanceStatisticsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentsRepo: Repository<Payment>,
    @InjectRepository(TokenUsageHistory)
    private readonly tokenRepo: Repository<TokenUsageHistory>,
    private readonly fxRates: FxRatesService,
  ) {}

  async getCommonFinanceStatistics(
    query: GetFinanceStatisticsQuery,
  ): Promise<CommonPoint[]> {
    const period = query.period;
    const tz = (query.timezone ?? 'UTC').trim();
    const baseCurrency = (query.baseCurrency ?? 'USD').toUpperCase();

    if (baseCurrency !== 'USD') {
    }

    if (period === FinancePeriod.ALL) {
      const revenueAll = await this.getRevenueAllUsd();
      const expensesAll = await this.getExpensesAllUsd();
      return [{ day: 'all', revenue: revenueAll, expenses: expensesAll }];
    }

    const periodsCount = query.periodsCount ?? 1;

    const range = this.buildRange(period, periodsCount);
    const labels = this.buildExpectedLabels(period, periodsCount, range.start);

    const revenueMap = await this.getRevenueGroupedUsd(
      period,
      range.start,
      range.end,
      tz,
    );
    const expensesMap = await this.getExpensesGroupedUsd(
      period,
      range.start,
      range.end,
      tz,
    );

    return labels.map((label) => ({
      day: label,
      revenue: round2(revenueMap.get(label) ?? 0),
      expenses: round2(expensesMap.get(label) ?? 0),
    }));
  }

  private async getRevenueAllUsd(): Promise<number> {
    const rows = await this.paymentsRepo
      .createQueryBuilder('p')
      .select('p.currency', 'currency')
      .addSelect('SUM(p.amount)', 'amount')
      .groupBy('p.currency')
      .getRawMany<{ currency: string; amount: string }>();

    let total = 0;
    for (const r of rows) {
      const amount = Number(r.amount ?? 0);
      const ccy = (r.currency ?? 'USD').toUpperCase();
      const rate = await this.fxRates.getUsdRate(ccy, new Date());
      total += amount * rate;
    }
    return total;
  }

  private async getRevenueGroupedUsd(
    period: FinancePeriod,
    start: Date,
    end: Date,
    tz: string,
  ): Promise<Map<string, number>> {
    const { bucketExpr, labelExpr } = this.bucketSql(
      period,
      'p."createdAt"',
      tz,
    );

    const rows = await this.paymentsRepo
      .createQueryBuilder('p')
      .select(labelExpr, 'label')
      .addSelect(bucketExpr, 'bucket')
      .addSelect('p.currency', 'currency')
      .addSelect('SUM(p.amount)', 'amount')
      .where('p."createdAt" >= :start AND p."createdAt" <= :end', {
        start,
        end,
      })
      .groupBy('label')
      .addGroupBy('bucket')
      .addGroupBy('p.currency')
      .orderBy('bucket', 'ASC')
      .getRawMany<{
        label: string;
        bucket: string;
        currency: string;
        amount: string;
      }>();

    const map = new Map<string, number>();

    for (const r of rows) {
      const label = r.label;
      const ccy = (r.currency ?? 'USD').toUpperCase();
      const amount = Number(r.amount ?? 0);

      const bucketDate = new Date(r.bucket);
      const rate = await this.fxRates.getUsdRate(ccy, bucketDate);

      map.set(label, (map.get(label) ?? 0) + amount * rate);
    }

    return map;
  }

  private async getExpensesAllUsd(): Promise<number> {
    const row = await this.tokenRepo
      .createQueryBuilder('t')
      .select('SUM(t.totalCredits)', 'credits')
      .getRawOne<{ credits: string }>();

    const credits = Number(row?.credits ?? 0);
    return credits / 10000;
  }

  private async getExpensesGroupedUsd(
    period: FinancePeriod,
    start: Date,
    end: Date,
    tz: string,
  ): Promise<Map<string, number>> {
    const { bucketExpr, labelExpr } = this.bucketSql(
      period,
      't."createdAt"',
      tz,
    );

    const rows = await this.tokenRepo
      .createQueryBuilder('t')
      .select(labelExpr, 'label')
      .addSelect(bucketExpr, 'bucket')
      .addSelect('SUM(t.totalCredits)', 'credits')
      .where('t."createdAt" >= :start AND t."createdAt" <= :end', {
        start,
        end,
      })
      .groupBy('label')
      .addGroupBy('bucket')
      .orderBy('bucket', 'ASC')
      .getRawMany<{ label: string; bucket: string; credits: string }>();

    const map = new Map<string, number>();
    for (const r of rows) {
      const label = r.label;
      const credits = Number(r.credits ?? 0);
      map.set(label, (map.get(label) ?? 0) + credits / 10000);
    }
    return map;
  }

  private bucketSql(
    period: FinancePeriod,
    createdAtSql: string,
    tz: string,
  ): { bucketExpr: string; labelExpr: string } {
    const localTs = `(${createdAtSql} AT TIME ZONE '${escapeTz(tz)}')`;

    if (period === FinancePeriod.DAY) {
      const bucket = `date_trunc('day', ${localTs})`;
      const label = `to_char(${bucket}, 'YYYY-MM-DD')`;
      return { bucketExpr: bucket, labelExpr: label };
    }
    if (period === FinancePeriod.WEEK) {
      const bucket = `date_trunc('week', ${localTs})`;
      const label = `to_char(${bucket}, 'IYYY-"W"IW')`;
      return { bucketExpr: bucket, labelExpr: label };
    }
    if (period === FinancePeriod.MONTH) {
      const bucket = `date_trunc('month', ${localTs})`;
      const label = `to_char(${bucket}, 'YYYY-MM')`;
      return { bucketExpr: bucket, labelExpr: label };
    }
    if (period === FinancePeriod.QUARTER) {
      const bucket = `date_trunc('quarter', ${localTs})`;
      const label = `(to_char(${bucket}, 'YYYY') || '-Q' || extract(quarter from ${bucket})::int)`;
      return { bucketExpr: bucket, labelExpr: label };
    }

    const bucket = `date_trunc('year', ${localTs})`;
    const label = `to_char(${bucket}, 'YYYY')`;
    return { bucketExpr: bucket, labelExpr: label };
  }

  private buildRange(
    period: FinancePeriod,
    periodsCount: number,
  ): { start: Date; end: Date } {
    const now = new Date();

    const end = now;

    const start = new Date(now);
    if (period === FinancePeriod.DAY)
      start.setUTCDate(start.getUTCDate() - (periodsCount - 1));
    if (period === FinancePeriod.WEEK)
      start.setUTCDate(start.getUTCDate() - 7 * (periodsCount - 1));
    if (period === FinancePeriod.MONTH)
      start.setUTCMonth(start.getUTCMonth() - (periodsCount - 1));
    if (period === FinancePeriod.QUARTER)
      start.setUTCMonth(start.getUTCMonth() - 3 * (periodsCount - 1));
    if (period === FinancePeriod.YEAR)
      start.setUTCFullYear(start.getUTCFullYear() - (periodsCount - 1));

    const startNorm = floorToPeriodUtc(period, start);

    return { start: startNorm, end };
  }

  private buildExpectedLabels(
    period: FinancePeriod,
    periodsCount: number,
    start: Date,
  ): string[] {
    const labels: string[] = [];
    let cursor = new Date(start);

    for (let i = 0; i < periodsCount; i++) {
      labels.push(formatLabelUtc(period, cursor));
      cursor = addPeriodUtc(period, cursor, 1);
    }

    return labels;
  }
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function escapeTz(tz: string) {
  return (tz ?? 'UTC').replace(/'/g, '');
}

function floorToPeriodUtc(period: FinancePeriod, d: Date): Date {
  const x = new Date(d);
  if (period === FinancePeriod.DAY) {
    x.setUTCHours(0, 0, 0, 0);
    return x;
  }
  if (period === FinancePeriod.WEEK) {
    const day = x.getUTCDay(); // 0..6
    const isoDow = day === 0 ? 7 : day; // 1..7
    x.setUTCDate(x.getUTCDate() - (isoDow - 1));
    x.setUTCHours(0, 0, 0, 0);
    return x;
  }
  if (period === FinancePeriod.MONTH) {
    x.setUTCDate(1);
    x.setUTCHours(0, 0, 0, 0);
    return x;
  }
  if (period === FinancePeriod.QUARTER) {
    const m = x.getUTCMonth(); // 0..11
    const qStart = Math.floor(m / 3) * 3;
    x.setUTCMonth(qStart, 1);
    x.setUTCHours(0, 0, 0, 0);
    return x;
  }

  x.setUTCMonth(0, 1);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function addPeriodUtc(period: FinancePeriod, d: Date, n: number): Date {
  const x = new Date(d);
  if (period === FinancePeriod.DAY) x.setUTCDate(x.getUTCDate() + n);
  else if (period === FinancePeriod.WEEK) x.setUTCDate(x.getUTCDate() + 7 * n);
  else if (period === FinancePeriod.MONTH) x.setUTCMonth(x.getUTCMonth() + n);
  else if (period === FinancePeriod.QUARTER)
    x.setUTCMonth(x.getUTCMonth() + 3 * n);
  else x.setUTCFullYear(x.getUTCFullYear() + n);
  return x;
}

function formatLabelUtc(period: FinancePeriod, d: Date): string {
  if (period === FinancePeriod.DAY) return yyyyMmDd(d);
  if (period === FinancePeriod.MONTH)
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
  if (period === FinancePeriod.YEAR) return `${d.getUTCFullYear()}`;
  if (period === FinancePeriod.QUARTER) {
    const q = Math.floor(d.getUTCMonth() / 3) + 1;
    return `${d.getUTCFullYear()}-Q${q}`;
  }

  const { isoYear, isoWeek: isoWeekNumber } = getIsoWeek(d);
  return `${isoYear}-W${pad2(isoWeekNumber)}`;
}

function yyyyMmDd(d: Date) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function getIsoWeek(date: Date): { isoYear: number; isoWeek: number } {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return { isoYear, isoWeek: weekNo };
}
