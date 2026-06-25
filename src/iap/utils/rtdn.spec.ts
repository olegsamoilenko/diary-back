import { describe, expect, it } from '@jest/globals';
import { decodeBase64Json, hasSubscriptionNotification } from './rtdn';

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
});
