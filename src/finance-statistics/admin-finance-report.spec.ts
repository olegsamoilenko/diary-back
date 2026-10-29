import { describe, expect, it, jest } from '@jest/globals';
import {
  aggregateFinance,
  FinanceReceipt,
  financeBucket,
  financeDay,
  financeRange,
} from './admin-finance-report';

const receipt = (patch: Partial<FinanceReceipt> = {}): FinanceReceipt => ({
  key: '1',
  product: 'lite-m1',
  date: '2026-10-01',
  amount: '100',
  currency: 'UAH',
  net: '68',
  estimated: false,
  ...patch,
});
const rate = async () => 0.025;
describe('admin finance report', () => {
  it('uses payment-day rates, deduplicates receipts and reconciles chart/card totals', async () => {
    const fx = jest.fn(async () => 0.025);
    const data = await aggregateFinance(
      [
        receipt(),
        receipt(),
        receipt({ key: '2', product: 'nemory_credits_5000' }),
      ],
      '2026-10-01',
      '2026-10-02',
      'day',
      fx,
    );
    expect(data.totals).toMatchObject({
      count: 2,
      grossUsd: 5,
      netUsd: 3.4,
      retainedPercent: 68,
      estimatedCount: 0,
    });
    expect(fx).toHaveBeenCalledTimes(1);
    expect(fx).toHaveBeenCalledWith('UAH', new Date('2026-10-01T12:00:00Z'));
    expect(data.points[0].amounts['lite-m1']).toBe(2.5);
    expect(data.points[1].counts['lite-m1']).toBe(0);
  });
  it.each(['day', 'week', 'month', 'quarter', 'year'] as const)(
    'preserves totals with %s grouping and excludes outside dates',
    async (group) => {
      const data = await aggregateFinance(
        [
          receipt(),
          receipt({ key: '2', date: '2026-10-20' }),
          receipt({ key: '3', date: '2026-09-30' }),
        ],
        '2026-10-01',
        '2026-10-28',
        group,
        rate,
      );
      expect(data.totals.count).toBe(2);
      expect(data.totals.grossUsd).toBe(5);
      expect(
        data.points.reduce((sum, p) => sum + p.amounts['lite-m1'], 0),
      ).toBe(5);
    },
  );
  it('shows missing FX as partial money while keeping counts and unknown net', async () => {
    const data = await aggregateFinance(
      [receipt()],
      '2026-10-01',
      '2026-10-01',
      'day',
      async () => {
        throw new Error('no FX');
      },
    );
    expect(data.totals).toMatchObject({
      count: 1,
      grossUsd: 0,
      missingAmountCount: 1,
      netUsd: null,
      retainedPercent: null,
    });
  });
  it('does not claim a retained share from incomplete or estimated receipts', async () => {
    const data = await aggregateFinance(
      [receipt(), receipt({ key: '2', estimated: true, net: '70' })],
      '2026-10-01',
      '2026-10-01',
      'day',
      rate,
    );
    expect(data.totals).toMatchObject({
      estimatedCount: 1,
      netKnownCount: 1,
      retainedPercent: null,
      netUsd: null,
    });
  });
  it('retains actual zero and avoids dividing by zero', async () => {
    const data = await aggregateFinance(
      [receipt({ amount: '0', net: '0' })],
      '2026-10-01',
      '2026-10-01',
      'day',
      rate,
    );
    expect(data.totals).toMatchObject({
      count: 1,
      grossUsd: 0,
      netUsd: 0,
      retainedPercent: null,
      missingAmountCount: 0,
    });
  });
  it('groups in Kyiv calendar days and ISO weeks across the year boundary', () => {
    expect(financeDay('2026-10-27T23:30:00Z')).toBe('2026-10-28');
    expect(financeBucket('2027-01-01', 'week')).toBe('2026-12-28');
    expect(financeBucket('2026-10-28', 'quarter')).toBe('2026-10-01');
  });
  it('rejects invalid dates, unknown grouping and excessive ranges', () => {
    expect(() => financeRange('2026-02-30', '2026-03-01', 'day')).toThrow();
    expect(() => financeRange('2026-10-01', '2026-10-02', 'bad')).toThrow();
    expect(() => financeRange('2000-01-01', '2026-10-28', 'day')).toThrow();
  });
});
