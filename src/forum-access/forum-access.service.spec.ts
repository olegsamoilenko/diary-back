import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ForumAccessService } from './forum-access.service';
import {
  SubscriptionAccessStatus,
  SubscriptionSource,
} from 'src/subscriptions/types';

describe('ForumAccessService', () => {
  const forumUserAccessRepo = {
    findOne: jest.fn(),
    create: jest.fn((payload: any) => payload),
    save: jest.fn(async (payload: any) => payload),
  };
  const forumMonthlyUsageRepo = {
    findOne: jest.fn(),
    create: jest.fn((payload: any) => payload),
  };
  const usersRepo = {
    findOne: jest.fn(),
  };
  const userPlanStatesRepo = {
    findOne: jest.fn(),
  };

  let service: ForumAccessService;
  const originalForumAccessMode = process.env.FORUM_ACCESS_MODE;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FORUM_ACCESS_MODE = 'subscription_only';
    service = new ForumAccessService(
      forumUserAccessRepo as any,
      forumMonthlyUsageRepo as any,
      usersRepo as any,
      userPlanStatesRepo as any,
    );
  });

  afterEach(() => {
    process.env.FORUM_ACCESS_MODE = originalForumAccessMode;
  });

  function mockCommonReads() {
    (usersRepo.findOne as any).mockResolvedValueOnce({
      id: 167,
      createdAt: new Date('2026-06-26T10:00:00.000Z'),
      role: 'USER',
      usesWithoutSubscription: false,
    });
    (forumUserAccessRepo.findOne as any).mockResolvedValueOnce({
      userId: 167,
      isGrandfathered: false,
      limitStartedAt: null,
    });
    (forumMonthlyUsageRepo.findOne as any).mockResolvedValueOnce({
      userId: 167,
      period: '2026-06',
      topicsCreated: 0,
      commentsCreated: 0,
    });
  }

  it('grants unlimited forum access from an active new subscription state', async () => {
    mockCommonReads();
    (userPlanStatesRepo.findOne as any).mockResolvedValueOnce({
      userId: 167,
      source: SubscriptionSource.GOOGLE_PLAY,
      accessStatus: SubscriptionAccessStatus.ACTIVE,
      useWithoutSubscription: false,
      expiryTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const result = await service.getAccessStatus(167);

    expect(userPlanStatesRepo.findOne).toHaveBeenCalledWith({
      where: { userId: 167 },
      select: {
        id: true,
        userId: true,
        source: true,
        accessStatus: true,
        useWithoutSubscription: true,
        expiryTime: true,
      },
    });
    expect(result.hasUnlimitedAccess).toBe(true);
    expect(result.isLimited).toBe(false);
  });

  it('limits forum access when the new subscription state is use-without-subscription', async () => {
    mockCommonReads();
    (userPlanStatesRepo.findOne as any).mockResolvedValueOnce({
      userId: 167,
      source: SubscriptionSource.NONE,
      accessStatus: SubscriptionAccessStatus.LIMITED,
      useWithoutSubscription: true,
      expiryTime: null,
    });

    const result = await service.getAccessStatus(167);

    expect(result.hasUnlimitedAccess).toBe(false);
    expect(result.isLimited).toBe(true);
  });
});
