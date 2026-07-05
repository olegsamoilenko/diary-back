import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SubscriptionUsageService } from './subscription-usage.service';
import { UserPlanState } from './entities/user-plan-state.entity';
import {
  SubscriptionAccessReason,
  SubscriptionAccessStatus,
  SubscriptionRuntime,
} from './types';
import { AiModel } from 'src/users/types';

describe('SubscriptionUsageService', () => {
  const dataSource = {
    transaction: jest.fn(),
  };
  const usersRepository = {
    findOne: jest.fn(),
  };
  const plansService = {
    getActualByUserId: jest.fn(),
    calculateCredits: jest.fn(),
  };
  const subscriptionsService = {
    getCurrentUserSubscription: jest.fn(),
    refreshEffectiveAccessState: jest.fn(),
    syncLegacyPlanToUserPlanState: jest.fn(),
  };

  let service: SubscriptionUsageService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SubscriptionUsageService(
      dataSource as any,
      usersRepository as any,
      plansService as any,
      subscriptionsService as any,
    );
  });

  function createManager(overrides: Partial<Record<string, jest.Mock>> = {}) {
    return {
      findOne: jest.fn(),
      merge: jest.fn((_entity: any, target: any, payload: any) =>
        Object.assign(target, payload),
      ),
      save: jest.fn(async (_entity: any, payload: any) => payload),
      ...overrides,
    };
  }

  it('records legacy runtime usage in legacy plans and syncs the saved plan into new subscription state', async () => {
    const savedPlan = {
      id: 58,
      userId: 167,
      usedCredits: 13,
      inputUsedCredits: 5,
      outputUsedCredits: 8,
    };
    const syncedSubscription = {
      id: 10,
      userId: 167,
      usedCredits: 13,
    };
    (usersRepository.findOne as any).mockResolvedValueOnce({
      id: 167,
      subscriptionRuntime: SubscriptionRuntime.LEGACY_COMPAT,
    });
    (plansService.getActualByUserId as any).mockResolvedValueOnce({
      plan: savedPlan,
    });
    (plansService.calculateCredits as any).mockResolvedValueOnce(savedPlan);
    (subscriptionsService.syncLegacyPlanToUserPlanState as any)
      .mockResolvedValueOnce(syncedSubscription);

    const result = await service.recordAiUsage(
      167,
      AiModel.GPT_5_MINI,
      1,
      100,
    );

    expect(plansService.calculateCredits).toHaveBeenCalledWith(
      167,
      AiModel.GPT_5_MINI,
      1,
      100,
    );
    expect(
      subscriptionsService.syncLegacyPlanToUserPlanState,
    ).toHaveBeenCalledWith(167, savedPlan);
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(result).toEqual({
      runtime: SubscriptionRuntime.LEGACY_COMPAT,
      plan: savedPlan,
      subscription: syncedSubscription,
    });
  });

  it('records usage in V2 state for legacy-runtime users when no legacy actual plan exists', async () => {
    const existingState = {
      id: 10,
      userId: 167,
      creditsLimit: 100,
      usedCredits: 10,
      inputUsedCredits: 4,
      outputUsedCredits: 6,
      accessStatus: SubscriptionAccessStatus.ACTIVE,
      metadata: { accessReason: SubscriptionAccessReason.NONE },
    };
    const manager = createManager({
      findOne: (jest.fn() as any).mockResolvedValueOnce(existingState),
      save: jest.fn(async (_entity: any, payload: any) => payload),
    });
    (usersRepository.findOne as any).mockResolvedValueOnce({
      id: 167,
      subscriptionRuntime: SubscriptionRuntime.LEGACY_COMPAT,
    });
    (plansService.getActualByUserId as any).mockResolvedValueOnce({
      plan: null,
    });
    (subscriptionsService.getCurrentUserSubscription as any)
      .mockResolvedValueOnce({ subscription: existingState });
    (subscriptionsService.refreshEffectiveAccessState as any)
      .mockResolvedValueOnce({ subscription: existingState });
    (dataSource.transaction as any).mockImplementationOnce((work: any) =>
      work(manager),
    );

    const result = await service.recordAiUsage(
      167,
      AiModel.GPT_5_MINI,
      1,
      100,
    );

    expect(plansService.calculateCredits).not.toHaveBeenCalled();
    expect(manager.save).toHaveBeenCalledWith(
      UserPlanState,
      expect.objectContaining({
        usedCredits: 13,
        inputUsedCredits: 5,
        outputUsedCredits: 8,
      }),
    );
    expect(result).toEqual({
      runtime: SubscriptionRuntime.V2,
      subscription: expect.objectContaining({
        userId: 167,
        usedCredits: 13,
      }),
    });
  });

  it('records V2 runtime usage only in user_plan_states and limits access when credits are exhausted', async () => {
    const existingState = {
      id: 10,
      userId: 167,
      creditsLimit: 13,
      usedCredits: 10,
      inputUsedCredits: 4,
      outputUsedCredits: 6,
      accessStatus: SubscriptionAccessStatus.ACTIVE,
      metadata: { accessReason: SubscriptionAccessReason.NONE },
    };
    const manager = createManager({
      findOne: (jest.fn() as any).mockResolvedValueOnce(existingState),
      save: jest.fn(async (_entity: any, payload: any) => payload),
    });
    (usersRepository.findOne as any).mockResolvedValueOnce({
      id: 167,
      subscriptionRuntime: SubscriptionRuntime.V2,
    });
    (subscriptionsService.refreshEffectiveAccessState as any)
      .mockResolvedValueOnce({ subscription: existingState });
    (dataSource.transaction as any).mockImplementationOnce((work: any) =>
      work(manager),
    );

    const result = await service.recordAiUsage(
      167,
      AiModel.GPT_5_MINI,
      1,
      100,
    );

    expect(plansService.calculateCredits).not.toHaveBeenCalled();
    expect(
      subscriptionsService.syncLegacyPlanToUserPlanState,
    ).not.toHaveBeenCalled();
    expect(manager.save).toHaveBeenCalledWith(
      UserPlanState,
      expect.objectContaining({
        usedCredits: 13,
        inputUsedCredits: 5,
        outputUsedCredits: 8,
        accessStatus: SubscriptionAccessStatus.LIMITED,
        metadata: expect.objectContaining({
          accessReason: SubscriptionAccessReason.CREDIT_EXCEEDED,
        }),
      }),
    );
    expect(result).toEqual({
      runtime: SubscriptionRuntime.V2,
      subscription: expect.objectContaining({
        usedCredits: 13,
        accessStatus: SubscriptionAccessStatus.LIMITED,
      }),
    });
  });

  it('does not record V2 usage when refreshed access is limited after subscription cancellation period ends', async () => {
    const expiredState = {
      id: 10,
      userId: 167,
      basePlanId: 'base-m1',
      creditsLimit: 80000,
      usedCredits: 236,
      inputUsedCredits: 167,
      outputUsedCredits: 69,
      accessStatus: SubscriptionAccessStatus.LIMITED,
      metadata: {
        accessReason: SubscriptionAccessReason.SUBSCRIPTION_CANCELED,
      },
    };
    (usersRepository.findOne as any).mockResolvedValueOnce({
      id: 167,
      subscriptionRuntime: SubscriptionRuntime.V2,
    });
    (subscriptionsService.refreshEffectiveAccessState as any)
      .mockResolvedValueOnce({ subscription: expiredState });

    await expect(
      service.recordAiUsage(167, AiModel.GPT_5_MINI, 1, 100),
    ).rejects.toThrow('Your subscription was canceled');

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(plansService.calculateCredits).not.toHaveBeenCalled();
  });

  it('does not record V2 usage when refreshed access is limited by a paused subscription', async () => {
    const pausedState = {
      id: 10,
      userId: 167,
      basePlanId: 'base-m1',
      accessStatus: SubscriptionAccessStatus.LIMITED,
      metadata: {
        accessReason: SubscriptionAccessReason.BILLING_PAUSED,
      },
    };
    (usersRepository.findOne as any).mockResolvedValueOnce({
      id: 167,
      subscriptionRuntime: SubscriptionRuntime.V2,
    });
    (subscriptionsService.refreshEffectiveAccessState as any)
      .mockResolvedValueOnce({ subscription: pausedState });

    await expect(
      service.recordAiUsage(167, AiModel.GPT_5_MINI, 1, 100),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        statusCode: 485,
        code: 'SUBSCRIPTION_PAUSED',
      }),
    });

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(plansService.calculateCredits).not.toHaveBeenCalled();
  });

  it('does not record V2 usage when refreshed access is limited by an on-hold subscription', async () => {
    const onHoldState = {
      id: 10,
      userId: 167,
      basePlanId: 'base-m1',
      accessStatus: SubscriptionAccessStatus.LIMITED,
      metadata: {
        accessReason: SubscriptionAccessReason.BILLING_ON_HOLD,
      },
    };
    (usersRepository.findOne as any).mockResolvedValueOnce({
      id: 167,
      subscriptionRuntime: SubscriptionRuntime.V2,
    });
    (subscriptionsService.refreshEffectiveAccessState as any)
      .mockResolvedValueOnce({ subscription: onHoldState });

    await expect(
      service.recordAiUsage(167, AiModel.GPT_5_MINI, 1, 100),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        statusCode: 484,
        code: 'SUBSCRIPTION_ON_HOLD',
      }),
    });

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(plansService.calculateCredits).not.toHaveBeenCalled();
  });

  it('does not record V2 usage when refreshed access is limited by a refunded subscription', async () => {
    const refundedState = {
      id: 10,
      userId: 167,
      basePlanId: 'base-m1',
      accessStatus: SubscriptionAccessStatus.LIMITED,
      metadata: {
        accessReason: SubscriptionAccessReason.SUBSCRIPTION_REFUNDED,
      },
    };
    (usersRepository.findOne as any).mockResolvedValueOnce({
      id: 167,
      subscriptionRuntime: SubscriptionRuntime.V2,
    });
    (subscriptionsService.refreshEffectiveAccessState as any)
      .mockResolvedValueOnce({ subscription: refundedState });

    await expect(
      service.recordAiUsage(167, AiModel.GPT_5_MINI, 1, 100),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        statusCode: 486,
        code: 'SUBSCRIPTION_REFUNDED',
      }),
    });

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(plansService.calculateCredits).not.toHaveBeenCalled();
  });
});
