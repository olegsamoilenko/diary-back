import { describe, expect, it, jest } from '@jest/globals';
import { GooglePlayPaymentFinanceService } from './google-play-payment-finance.service';

describe('subscription payment finance synchronization', () => {
  it('registers each order idempotently within the existing transaction without contacting Google', async () => {
    const query = jest.fn(async (_sql: string, _params: unknown[]) => []);
    const get = jest.fn();
    const service = new GooglePlayPaymentFinanceService(
      {} as any,
      { android: { orders: { get } } } as any,
    );
    await service.enqueue(
      { query } as any,
      {
        provider: 'GOOGLE_PLAY',
        lastOrderId: 'order..1',
        basePlanId: 'lite-m1',
        rawStoreData: { testPurchase: {} },
        currency: 'UAH',
      } as any,
      'test.package',
    );
    expect(query.mock.calls[0][0]).toContain('ON CONFLICT ("orderId")');
    expect(query.mock.calls[0][1]).toContain('order..1');
    expect(get).not.toHaveBeenCalled();
  });
  it('persists the actual paid date, tax and revenue and completes a zero-revenue test order', async () => {
    const query = jest
      .fn<any>()
      .mockResolvedValueOnce([
        {
          id: 1,
          orderId: 'order..1',
          productId: 'sku',
          packageName: 'test.package',
        },
      ])
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([]);
    const get = jest.fn<any>().mockResolvedValue({
      data: {
        orderId: 'order..1',
        state: 'PROCESSED',
        total: { currencyCode: 'UAH', units: '120' },
        tax: { currencyCode: 'UAH', units: '20' },
        developerRevenueInBuyerCurrency: { currencyCode: 'UAH', units: '0' },
        orderHistory: {
          processedEvent: { eventTime: '2026-10-01T10:00:00Z' },
        },
        lineItems: [
          {
            productId: 'sku',
            subscriptionDetails: { basePlanId: 'lite-m1' },
          },
        ],
      },
    });
    const service = new GooglePlayPaymentFinanceService(
      { query } as any,
      { android: { orders: { get } } } as any,
    );
    await service.syncPending();
    expect(query.mock.calls[2][1]).toEqual([
      1,
      '120.000000000',
      'UAH',
      '0.000000000',
      '20.000000000',
      'PROCESSED',
      '2026-10-01T10:00:00Z',
      'lite-m1',
      'sku',
      false,
    ]);
  });
  it('retains pending work on unavailable Google data without touching entitlements', async () => {
    const query = jest
      .fn<any>()
      .mockResolvedValueOnce([{ id: 1, orderId: 'order' }])
      .mockResolvedValueOnce([{ id: 1 }]);
    const get = jest.fn<any>().mockRejectedValue(new Error('unavailable'));
    await new GooglePlayPaymentFinanceService(
      { query } as any,
      { android: { orders: { get } } } as any,
    ).syncPending();
    expect(query).toHaveBeenCalledTimes(2);
  });
});
