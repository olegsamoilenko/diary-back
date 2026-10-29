import { describe, expect, it, jest } from '@jest/globals';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminFinanceService } from './admin-finance.service';
import { FinanceStatisticsController } from './finance-statistics.controller';

function fixture({
  credits = [],
  payments = [],
  candidates = [],
  orders = {},
}: {
  credits?: any[];
  payments?: any[];
  candidates?: any[];
  orders?: Record<string, any>;
} = {}) {
  const query = jest.fn(
    async (sql: string): Promise<any[]> =>
      sql.includes('FROM credit_purchases')
        ? credits
        : sql.includes('FROM payments')
          ? payments
          : candidates,
  );
  const get = jest.fn(async ({ orderId }: { orderId: string }) => {
    if (!orders[orderId]) throw new Error('not available');
    return { data: orders[orderId] };
  });
  const service = new AdminFinanceService(
    { query } as any,
    { android: { orders: { get } } } as any,
    { getUsdRate: async () => 1 } as any,
  );
  return { service, query, get };
}
const candidate = (orderId: string, test = false) => ({
  orderId,
  product: 'lite-m1',
  observedAt: '2026-10-10T12:00:00Z',
  test,
  package: 'test.package',
});
const order = (orderId: string, extra: Record<string, unknown> = {}) => ({
  orderId,
  state: 'PROCESSED',
  createTime: '2026-10-10T12:00:00Z',
  total: { currencyCode: 'USD', units: '10' },
  developerRevenueInBuyerCurrency: { currencyCode: 'USD', units: '7' },
  lineItems: [
    {
      productId: 'nemory_base',
      subscriptionDetails: { basePlanId: 'lite-m1' },
    },
  ],
  ...extra,
});
const report = (service: AdminFinanceService, tests = false) =>
  service.report('2026-10-01', '2026-10-28', 'day', tests);

describe('admin finance data sources', () => {
  it('uses saved income offline and labels subscription income estimated from actual order tax', async () => {
    const f = fixture({
      payments: [
        {
          id: 1,
          orderId: 'stored',
          product: 'lite-m1',
          amount: '120',
          currency: 'USD',
          createdAt: '2026-10-10',
          developerRevenue: '80',
          taxAmount: '20',
          testPurchase: false,
        },
        {
          id: 2,
          orderId: 'estimated',
          product: 'lite-m1',
          amount: '120',
          currency: 'USD',
          createdAt: '2026-10-10',
          developerRevenue: null,
          taxAmount: '20',
          testPurchase: false,
        },
      ],
    });
    const data = await report(f.service);
    expect(data.totals).toMatchObject({
      count: 2,
      grossUsd: 240,
      netUsd: 165,
      netEstimatedCount: 1,
      netKnownCount: 2,
    });
  });
  it('protects the new financial route with the existing admin guard', () => {
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        FinanceStatisticsController.prototype.getAdminRevenue,
      ),
    ).toHaveLength(1);
  });
  it('counts renewal orders separately while deduplicating the legacy payment source', async () => {
    const f = fixture({
      payments: [
        {
          id: 1,
          orderId: 'o1',
          product: 'lite-m1',
          amount: '10',
          currency: 'USD',
          createdAt: '2026-10-10',
        },
      ],
      candidates: [candidate('o1'), candidate('o2')],
      orders: { o1: order('o1'), o2: order('o2') },
    });
    const data = await report(f.service);
    expect(data.totals).toMatchObject({
      count: 2,
      grossUsd: 20,
      netUsd: 14,
      retainedPercent: 70,
    });
  });
  it('uses the actual order payment date instead of its later ingestion date', async () => {
    const f = fixture({
      candidates: [candidate('o1')],
      orders: {
        o1: order('o1', {
          orderHistory: {
            processedEvent: { eventTime: '2026-09-20T12:00:00Z' },
          },
        }),
      },
    });
    expect((await report(f.service)).totals.count).toBe(0);
  });
  it('excludes known test orders from both sources unless requested', async () => {
    const f = fixture({
      candidates: [candidate('o1', true)],
      payments: [
        {
          id: 1,
          orderId: 'o1',
          product: 'lite-m1',
          amount: '10',
          currency: 'USD',
          createdAt: '2026-10-10',
        },
      ],
      orders: { o1: order('o1') },
    });
    expect((await report(f.service)).totals.count).toBe(0);
    expect(f.get).not.toHaveBeenCalled();
    expect((await report(f.service, true)).totals.count).toBe(1);
  });
  it('removes a fully refunded order even if a legacy payment exists', async () => {
    const f = fixture({
      candidates: [candidate('o1')],
      payments: [
        {
          id: 1,
          orderId: 'o1',
          product: 'lite-m1',
          amount: '10',
          currency: 'USD',
          createdAt: '2026-10-10',
        },
      ],
      orders: { o1: order('o1', { state: 'REFUNDED' }) },
    });
    const data = await report(f.service);
    expect(data.totals.count).toBe(0);
    expect(data.coverage.excludedRefunds).toBe(1);
  });
  it('labels failed-order fallback instead of inventing net revenue or exact dates', async () => {
    const f = fixture({ candidates: [candidate('o1')] });
    const data = await report(f.service);
    expect(data.totals).toMatchObject({
      count: 1,
      grossUsd: 5.99,
      estimatedCount: 1,
      netUsd: null,
    });
    expect(data.estimatedDates).toBe(1);
    expect(data.coverage.unresolvedOrders).toBe(1);
  });
  it('keeps manually entered credit amounts authoritative and uses catalog only when missing', async () => {
    const f = fixture({
      credits: [
        {
          id: 1,
          productId: 'nemory_credits_5000',
          quantity: 1,
          amount: '12.34',
          currency: 'USD',
          date: '2026-10-10',
        },
        {
          id: 2,
          productId: 'nemory_credits_5000',
          quantity: 1,
          amount: null,
          currency: null,
          date: '2026-10-10',
        },
      ],
    });
    expect((await report(f.service)).totals).toMatchObject({
      count: 2,
      grossUsd: 14.83,
      estimatedCount: 1,
    });
  });
});
