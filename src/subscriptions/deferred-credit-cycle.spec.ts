import { describe, expect, it } from '@jest/globals';
import { preservesDeferredCreditCycle } from './deferred-credit-cycle';
import { SubscriptionBasePlanId } from './types';

describe('deferred credit cycle', () => {
  const state = {
    basePlanId: SubscriptionBasePlanId.LITE_M1,
    expiryTime: '2026-11-01T00:00:00Z',
  };
  const incoming = {
    ...state,
    deferredReplacementProductId: 'nemory_ad_free',
  } as any;
  it('preserves the current period only', () => {
    expect(preservesDeferredCreditCycle(state, incoming)).toBe(true);
    expect(
      preservesDeferredCreditCycle(state, {
        ...incoming,
        expiryTime: '2026-12-01T00:00:00Z',
      }),
    ).toBe(false);
    expect(
      preservesDeferredCreditCycle(state, {
        ...incoming,
        deferredReplacementProductId: null,
      }),
    ).toBe(false);
    expect(
      preservesDeferredCreditCycle(state, {
        ...incoming,
        basePlanId: SubscriptionBasePlanId.AD_FREE_M1,
      }),
    ).toBe(false);
    expect(preservesDeferredCreditCycle(null, incoming)).toBe(false);
  });
});
