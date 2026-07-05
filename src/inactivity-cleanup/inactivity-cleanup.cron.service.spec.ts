import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { InactivityCleanupCronService } from './inactivity-cleanup.cron.service';
import {
  SubscriptionAccessStatus,
  SubscriptionSource,
} from 'src/subscriptions/types';

describe('InactivityCleanupCronService subscription checks', () => {
  const usersRepo = {};
  const userPlanStatesRepo = {
    findOne: jest.fn(),
  };
  const emailsService = {};
  const usersService = {};
  const redis = {};

  let service: InactivityCleanupCronService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InactivityCleanupCronService(
      usersRepo as any,
      userPlanStatesRepo as any,
      emailsService as any,
      usersService as any,
      redis as any,
    );
  });

  it('treats active paid new subscription state as subscribed', () => {
    const isNotSubscribed = (service as any).isNotSubscribed({
      source: SubscriptionSource.GOOGLE_PLAY,
      accessStatus: SubscriptionAccessStatus.ACTIVE,
      useWithoutSubscription: false,
      expiryTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    expect(isNotSubscribed).toBe(false);
  });

  it('treats trial, no-plan, use-without-subscription and expired paid states as not subscribed', () => {
    expect((service as any).isNotSubscribed(null)).toBe(true);
    expect(
      (service as any).isNotSubscribed({
        source: SubscriptionSource.TRIAL,
        accessStatus: SubscriptionAccessStatus.ACTIVE,
        useWithoutSubscription: false,
        expiryTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }),
    ).toBe(true);
    expect(
      (service as any).isNotSubscribed({
        source: SubscriptionSource.NONE,
        accessStatus: SubscriptionAccessStatus.LIMITED,
        useWithoutSubscription: true,
        expiryTime: null,
      }),
    ).toBe(true);
    expect(
      (service as any).isNotSubscribed({
        source: SubscriptionSource.GOOGLE_PLAY,
        accessStatus: SubscriptionAccessStatus.ACTIVE,
        useWithoutSubscription: false,
        expiryTime: new Date(Date.now() - 60 * 1000),
      }),
    ).toBe(true);
  });
});
