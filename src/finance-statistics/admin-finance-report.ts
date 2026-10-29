import { BadRequestException } from '@nestjs/common';
import {
  registrationRange,
  ADMIN_TIMEZONE,
} from '../users/admin-user-statistics';

export const FINANCE_PRODUCTS = [
  { id: 'ad-free-m1', name: 'Без реклами · місяць', kind: 'subscription' },
  { id: 'ad-free-y1', name: 'Без реклами · рік', kind: 'subscription' },
  { id: 'lite-m1', name: 'Lite', kind: 'subscription' },
  { id: 'base-m1', name: 'Base', kind: 'subscription' },
  { id: 'pro-m1', name: 'Pro', kind: 'subscription' },
  { id: 'nemory_credits_5000', name: '5 000 кредитів', kind: 'credits' },
  { id: 'nemory_credits_20000', name: '20 000 кредитів', kind: 'credits' },
  { id: 'nemory_credits_40000', name: '40 000 кредитів', kind: 'credits' },
] as const;
export type FinanceGroup = 'day' | 'week' | 'month' | 'quarter' | 'year';
export type FinanceReceipt = {
  key: string;
  product: string;
  date: string;
  amount: string | null;
  currency: string | null;
  net: string | null;
  netEstimated?: boolean;
  estimated: boolean;
  dateEstimated?: boolean;
};

export function financeRange(from: string, to: string, grouping: string) {
  registrationRange(from, to);
  if (!['day', 'week', 'month', 'quarter', 'year'].includes(grouping))
    throw new BadRequestException('Невідоме групування.');
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 3660)
    throw new BadRequestException('Оберіть період до 10 років.');
  return grouping as FinanceGroup;
}
export function financeDay(date: Date | string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ADMIN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date));
}
export function financeBucket(day: string, group: FinanceGroup) {
  const d = new Date(`${day}T00:00:00Z`);
  if (group === 'week')
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  if (group === 'month' || group === 'quarter' || group === 'year')
    d.setUTCDate(1);
  if (group === 'quarter') d.setUTCMonth(Math.floor(d.getUTCMonth() / 3) * 3);
  if (group === 'year') d.setUTCMonth(0);
  return d.toISOString().slice(0, 10);
}
export async function aggregateFinance(
  receipts: FinanceReceipt[],
  from: string,
  to: string,
  group: FinanceGroup,
  getRate: (currency: string, date: Date) => Promise<number>,
) {
  const empty = () => ({
    count: 0,
    grossCents: 0,
    netCents: 0,
    netKnown: 0,
    netEstimatedCount: 0,
    estimatedCount: 0,
    missingAmountCount: 0,
  });
  const products = new Map(
    FINANCE_PRODUCTS.map((p) => [p.id as string, { ...p, ...empty() }]),
  );
  const points = new Map<
    string,
    {
      date: string;
      from: string;
      to: string;
      counts: Record<string, number>;
      amounts: Record<string, number>;
    }
  >();
  for (
    let d = new Date(`${from}T00:00:00Z`);
    d <= new Date(`${to}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const date = financeBucket(d.toISOString().slice(0, 10), group);
    if (!points.has(date))
      points.set(date, {
        date,
        from: d.toISOString().slice(0, 10),
        to: d.toISOString().slice(0, 10),
        counts: Object.fromEntries(FINANCE_PRODUCTS.map((p) => [p.id, 0])),
        amounts: Object.fromEntries(FINANCE_PRODUCTS.map((p) => [p.id, 0])),
      });
    else points.get(date)!.to = d.toISOString().slice(0, 10);
  }
  let estimatedDates = 0;
  const unique = [...new Map(receipts.map((r) => [r.key, r])).values()].filter(
    (r) => r.date >= from && r.date <= to && products.has(r.product),
  );
  // One request per currency/day, with bounded external concurrency.
  const rates = new Map<string, number | null>();
  const jobs = [
    ...new Map(
      unique
        .filter((r) => r.currency && r.amount !== null)
        .map((r) => [`${r.currency}:${r.date}`, r]),
    ).entries(),
  ];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, jobs.length) }, async () => {
      while (cursor < jobs.length) {
        const [key, row] = jobs[cursor++];
        try {
          const rate = await getRate(
            row.currency!,
            new Date(`${row.date}T12:00:00Z`),
          );
          rates.set(key, Number.isFinite(rate) && rate > 0 ? rate : null);
        } catch {
          rates.set(key, null);
        }
      }
    }),
  );
  for (const receipt of unique) {
    const product = products.get(receipt.product)!;
    const point = points.get(financeBucket(receipt.date, group))!;
    product.count++;
    point.counts[receipt.product]++;
    if (receipt.estimated) product.estimatedCount++;
    if (receipt.dateEstimated) estimatedDates++;
    const rate = rates.get(`${receipt.currency}:${receipt.date}`);
    const amount = receipt.amount === null ? NaN : Number(receipt.amount);
    const cents = rate ? Math.round(amount * rate * 100) : NaN;
    if (!Number.isSafeInteger(cents) || cents < 0) {
      product.missingAmountCount++;
      continue;
    }
    product.grossCents += cents;
    point.amounts[receipt.product] += cents;
    if (!receipt.estimated && receipt.net !== null) {
      const net = Math.round(Number(receipt.net) * rate! * 100);
      if (Number.isSafeInteger(net)) {
        product.netKnown++;
        product.netCents += net;
        if (receipt.netEstimated) product.netEstimatedCount++;
      }
    }
  }
  const finish = (value: ReturnType<typeof empty>) => ({
    count: value.count,
    grossUsd: value.grossCents / 100,
    netUsd: value.netKnown === value.count ? value.netCents / 100 : null,
    retainedPercent:
      value.count > 0 && value.netKnown === value.count && value.grossCents > 0
        ? Math.round((value.netCents / value.grossCents) * 1000) / 10
        : null,
    estimatedCount: value.estimatedCount,
    missingAmountCount: value.missingAmountCount,
    netKnownCount: value.netKnown,
    netEstimatedCount: value.netEstimatedCount,
  });
  const totals = empty();
  for (const product of products.values())
    for (const key of Object.keys(totals) as (keyof typeof totals)[])
      totals[key] += product[key];
  return {
    from,
    to,
    granularity: group,
    timezone: ADMIN_TIMEZONE,
    totals: finish(totals),
    estimatedDates,
    products: [...products.values()].map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind,
      ...finish(p),
    })),
    points: [...points.values()].map((p) => ({
      ...p,
      amounts: Object.fromEntries(
        Object.entries(p.amounts).map(([key, cents]) => [key, cents / 100]),
      ),
    })),
  };
}
