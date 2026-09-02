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
    expect(access.reason).toBe(
      SubscriptionAccessReason.INSUFFICIENT_AI_CREDITS,
    );
  });
});
