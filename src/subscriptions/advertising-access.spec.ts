import { describe, expect, it } from '@jest/globals';
import { buildAdvertisingAccess } from './advertising-access';
import {
  SubscriptionAccessReason as Reason,
  SubscriptionAccessStatus as Access,
  SubscriptionBasePlanId as Plan,
  SubscriptionBillingStatus as Billing,
  SubscriptionSource as Source,
} from './types';

const now = new Date('2026-10-04T12:00:00.000Z');
const paid = {
  source: Source.GOOGLE_PLAY,
  basePlanId: Plan.LITE_M1,
  billingStatus: Billing.ACTIVE,
  accessStatus: Access.ACTIVE,
  startTime: '2026-10-01T12:00:00.000Z',
  expiryTime: '2026-11-01T12:00:00.000Z',
  metadata: null,
};
const trial = {
  ...paid,
  source: Source.TRIAL,
  basePlanId: Plan.START,
  billingStatus: Billing.NONE,
};

describe('advertising access independent of AI credits', () => {
  it.each([Plan.AD_FREE_M1, Plan.LITE_M1, Plan.BASE_M1, Plan.PRO_M1])(
    'keeps %s ad-free after credits are exhausted or the user continues without AI',
    (basePlanId) => {
      const subscription = {
        ...paid,
        basePlanId,
        accessStatus: Access.LIMITED,
        metadata: { accessReason: Reason.CREDIT_EXCEEDED },
        creditsLimit: 30000,
        usedCredits: 30000,
        useWithoutSubscription: true,
      };
      expect(buildAdvertisingAccess(subscription, now)).toEqual({
        status: 'AD_FREE',
        reason: 'PAID_SUBSCRIPTION',
        validUntil: paid.expiryTime,
      });
    },
  );

  it.each([Billing.ACTIVE, Billing.IN_GRACE, Billing.CANCELED])(
    'respects the remaining paid period for %s',
    (billingStatus) => {
      expect(
        buildAdvertisingAccess({ ...paid, billingStatus }, now).status,
      ).toBe('AD_FREE');
    },
  );

  it.each([Billing.ACTIVE, Billing.IN_GRACE, Billing.CANCELED])(
    'ends ad-free at expiry even if stored billing/access still says %s/ACTIVE',
    (billingStatus) => {
      expect(
        buildAdvertisingAccess(
          { ...paid, billingStatus, expiryTime: now },
          now,
        ),
      ).toEqual({
        status: 'AD_SUPPORTED',
        reason: 'EXPIRED',
        validUntil: null,
      });
    },
  );

  it.each([Billing.ON_HOLD, Billing.PAUSED, Billing.REFUNDED, Billing.EXPIRED])(
    'does not grant ad-free for %s even with a future expiry',
    (billingStatus) => {
      expect(
        buildAdvertisingAccess({ ...paid, billingStatus }, now).status,
      ).toBe('AD_SUPPORTED');
    },
  );

  it.each([Source.APP_STORE, Source.MANUAL])('supports %s', (source) => {
    expect(buildAdvertisingAccess({ ...paid, source }, now).status).toBe(
      'AD_FREE',
    );
  });

  it('preserves the existing paid legacy rule when expiry is absent', () => {
    expect(buildAdvertisingAccess({ ...paid, expiryTime: null }, now)).toEqual({
      status: 'AD_FREE',
      reason: 'PAID_SUBSCRIPTION',
      validUntil: null,
    });
  });

  it('keeps Start ad-free for its duration even with no AI credits left', () => {
    expect(
      buildAdvertisingAccess(
        {
          ...trial,
          accessStatus: Access.LIMITED,
          metadata: { accessReason: Reason.CREDIT_EXCEEDED },
        },
        now,
      ),
    ).toEqual({
      status: 'AD_FREE',
      reason: 'TRIAL',
      validUntil: trial.expiryTime,
    });
    expect(
      buildAdvertisingAccess({ ...trial, expiryTime: now }, now).status,
    ).toBe('AD_SUPPORTED');
  });

  it('exempts testing accounts', () => {
    expect(
      buildAdvertisingAccess(
        { ...trial, basePlanId: Plan.TESTING, expiryTime: null },
        now,
      ),
    ).toEqual({ status: 'AD_FREE', reason: 'TESTING', validUntil: null });
  });

  it('marks an explicit free account as ad-supported without considering wallet credits', () => {
    const free = {
      ...paid,
      source: Source.NONE,
      basePlanId: null,
      billingStatus: Billing.NONE,
      expiryTime: null,
      purchasedCredits: { remaining: 40000 },
    };
    expect(buildAdvertisingAccess(free, now)).toEqual({
      status: 'AD_SUPPORTED',
      reason: 'NO_SUBSCRIPTION',
      validUntil: null,
    });
  });

  it.each([
    null,
    { ...paid, billingStatus: Billing.UNKNOWN },
    { ...paid, billingStatus: Billing.PENDING },
    { ...paid, billingStatus: Billing.NONE },
    { ...paid, billingStatus: 'future-status' as Billing },
    { ...paid, source: Source.NONE },
    { ...paid, source: Source.TRIAL },
    { ...paid, basePlanId: null },
    { ...paid, basePlanId: 'future-plan' as Plan },
    { ...paid, expiryTime: 'invalid' },
    { ...paid, startTime: 'invalid' },
    { ...paid, startTime: '2026-11-01T12:00:00.000Z' },
    { ...paid, accessStatus: Access.BLOCKED },
    { ...paid, metadata: { accessReason: Reason.ADMIN_DISABLED } },
    { ...trial, expiryTime: null },
  ])(
    'does not authorize advertising for unverified state %#',
    (subscription) => {
      expect(buildAdvertisingAccess(subscription, now)).toEqual({
        status: 'UNKNOWN',
        reason: 'UNVERIFIED',
        validUntil: null,
      });
    },
  );
});
