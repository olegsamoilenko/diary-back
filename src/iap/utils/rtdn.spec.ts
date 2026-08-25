import { describe, expect, it } from '@jest/globals';
import {
  decodeBase64Json,
  hasOneTimeProductNotification,
  hasSubscriptionNotification,
  hasVoidedPurchaseNotification,
} from './rtdn';

describe('RTDN utils', () => {
  it('decodes valid base64 JSON payloads', () => {
    const payload = { packageName: 'app.package' };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString(
      'base64',
    );

    expect(decodeBase64Json(encoded)).toEqual(payload);
  });

  it('returns null for malformed base64 JSON payloads', () => {
    expect(decodeBase64Json('not-valid-json')).toBeNull();
  });

  it('detects subscription notifications', () => {
    expect(
      hasSubscriptionNotification({
        subscriptionNotification: {
          purchaseToken: 'token',
        },
      }),
    ).toBe(true);
  });

  it('returns false when subscription notification is missing', () => {
    expect(hasSubscriptionNotification({ packageName: 'app.package' })).toBe(
      false,
    );
  });

  it('detects one-time product notifications', () => {
    expect(
      hasOneTimeProductNotification({
        oneTimeProductNotification: {
          purchaseToken: 'token',
          sku: 'nemory_credits_5000',
        },
      }),
    ).toBe(true);
  });

  it('detects voided purchase notifications', () => {
    expect(
      hasVoidedPurchaseNotification({
        voidedPurchaseNotification: {
          purchaseToken: 'token',
          productType: 2,
        },
      }),
    ).toBe(true);
  });
});
