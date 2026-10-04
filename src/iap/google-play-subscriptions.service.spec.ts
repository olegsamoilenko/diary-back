import { describe, expect, it, jest } from '@jest/globals';
import { GooglePlaySubscriptionsService } from './google-play-subscriptions.service';

describe('Google Play ad-free product identity', () => {
  it.each([false, true])(
    'selects the effective item before/after deferred renewal (renewed=%s)',
    async (renewed) => {
      const service = serviceWith('nemory', 'lite-m1');
      const oldItem = {
        productId: 'nemory',
        offerDetails: { basePlanId: 'lite-m1' },
        expiryTime: '2026-11-01T00:00:00Z',
        ...(renewed
          ? {}
          : { deferredItemReplacement: { productId: 'nemory_ad_free' } }),
      };
      const newItem = {
        productId: 'nemory_ad_free',
        offerDetails: { basePlanId: 'ad-free-m1' },
        ...(renewed ? { expiryTime: '2026-12-01T00:00:00Z' } : {}),
      };
      (service.android.purchases.subscriptionsv2.get as any).mockResolvedValue({
        data: {
          startTime: '2026-10-01T00:00:00Z',
          subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
          lineItems: renewed ? [oldItem, newItem] : [newItem, oldItem],
        },
      });
      const result = await service.verifyAndroidSubscription(
        'app.package',
        'new-token',
      );
      expect(result.storeData.basePlanId).toBe(
        renewed ? 'ad-free-m1' : 'lite-m1',
      );
      expect(result.storeData.deferredReplacementProductId).toBe(
        renewed ? null : 'nemory_ad_free',
      );
    },
  );
  function serviceWith(productId: string, basePlanId: string) {
    const service = new GooglePlaySubscriptionsService();
    service.android = {
      purchases: {
        subscriptionsv2: {
          get: jest.fn(async () => ({
            data: {
              startTime: '2026-10-01T00:00:00Z',
              subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
              lineItems: [
                {
                  productId,
                  offerDetails: { basePlanId },
                  expiryTime: '2026-11-01T00:00:00Z',
                },
              ],
            },
          })),
        },
      },
    } as any;
    return service;
  }

  it('accepts the verified ad-free product and monthly base plan', async () => {
    await expect(
      serviceWith('nemory_ad_free', 'ad-free-m1').verifyAndroidSubscription(
        'app.package',
        'test-token',
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        storeData: expect.objectContaining({
          productId: 'nemory_ad_free',
          basePlanId: 'ad-free-m1',
          storeStatus: 'ACTIVE',
        }),
      }),
    );
  });

  it.each([
    ['nemory', 'ad-free-m1'],
    ['nemory_ad_free', 'pro-m1'],
  ])('rejects mismatched identity %s / %s', async (productId, basePlanId) => {
    await expect(
      serviceWith(productId, basePlanId).verifyAndroidSubscription(
        'app.package',
        'test-token',
      ),
    ).rejects.toThrow('Invalid ad-free');
  });

  it('keeps the existing AI product compatible', async () => {
    await expect(
      serviceWith('nemory', 'base-m1').verifyAndroidSubscription(
        'app.package',
        'test-token',
      ),
    ).resolves.toBeDefined();
  });
});
