import { describe, expect, it } from '@jest/globals';
import { buildEffectiveAiAccess } from './effective-ai-access';
import { SubscriptionAccessReason, SubscriptionAccessStatus } from './types';

describe('buildEffectiveAiAccess', () => {
  const activeSubscription = (remaining: number) =>
    ({
      accessStatus: SubscriptionAccessStatus.ACTIVE,
      creditsLimit: 30_000,
      usedCredits: 30_000 - remaining,
      metadata: { accessReason: SubscriptionAccessReason.NONE },
    }) as any;

  it('keeps AI limited below the start threshold even with an active plan', () => {
    // Existing admission threshold is shared by trial and paid plans.
    const wallet = { total: 0, used: 0, remaining: 0, debt: 0, revoked: 0 };
    for (const remaining of [0, 1, 499, 500]) {
      const access = buildEffectiveAiAccess(activeSubscription(remaining), wallet);
      expect(access.status).toBe(remaining >= 500
        ? SubscriptionAccessStatus.ACTIVE : SubscriptionAccessStatus.LIMITED);
      expect(access.reason).toBe(remaining >= 500
        ? SubscriptionAccessReason.NONE : SubscriptionAccessReason.INSUFFICIENT_AI_CREDITS);
    }
  });

  it('allows purchased credits without a plan and after plan credits run out', () => {
    const wallet = { total: 1000, used: 0, remaining: 1000, debt: 0, revoked: 0 };
    for (const subscription of [null, activeSubscription(0)]) {
      const access = buildEffectiveAiAccess(subscription, wallet);
      expect(access.status).toBe(SubscriptionAccessStatus.ACTIVE);
      expect(access.source).toBe('PURCHASED_CREDITS');
    }
    expect(buildEffectiveAiAccess(null, { ...wallet, remaining: 0 }).status)
      .toBe(SubscriptionAccessStatus.LIMITED);
  });

  it('does not bypass an admin block with purchased credits', () => {
    const access = buildEffectiveAiAccess({ ...activeSubscription(1000),
      accessStatus: SubscriptionAccessStatus.BLOCKED,
      metadata: { accessReason: SubscriptionAccessReason.ADMIN_DISABLED },
    }, { total: 1000, used: 0, remaining: 1000, debt: 0, revoked: 0 });
    expect(access.status).toBe(SubscriptionAccessStatus.BLOCKED);
  });

  it('combines plan and purchased credits for the 500-credit start reserve', () => {
    const access = buildEffectiveAiAccess(activeSubscription(300), {
      total: 5_000,
      used: 4_700,
      remaining: 300,
      debt: 0,
      revoked: 0,
    });

    expect(access).toEqual(
      expect.objectContaining({
        status: SubscriptionAccessStatus.ACTIVE,
        availableCredits: 600,
        planRemainingCredits: 300,
        purchasedCreditsRemaining: 300,
      }),
    );
  });

  it('subtracts wallet debt from credits supplied by a later subscription', () => {
    const access = buildEffectiveAiAccess(activeSubscription(30_000), {
      total: 0,
      used: 100,
      remaining: 0,
      debt: 100,
      revoked: 0,
    });

    expect(access.availableCredits).toBe(29_900);
    expect(access.status).toBe(SubscriptionAccessStatus.ACTIVE);
  });

  it('does not start a new cycle when debt leaves less than 500 net credits', () => {
    const access = buildEffectiveAiAccess(activeSubscription(600), {
      total: 0,
      used: 150,
      remaining: 0,
      debt: 150,
      revoked: 0,
    });

    expect(access.availableCredits).toBe(450);
    expect(access.status).toBe(SubscriptionAccessStatus.LIMITED);
    expect(access.reason).toBe(
      SubscriptionAccessReason.INSUFFICIENT_AI_CREDITS,
    );
  });
});
