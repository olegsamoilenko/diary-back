import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { HttpException } from '@nestjs/common';
import { PlanGuard } from './plan.guard';
import { BasePlanIds, PlanStatus } from 'src/plans/types';
import { HttpStatus } from 'src/common/utils/http-status';
import {
  SubscriptionAccessReason,
  SubscriptionAccessStatus,
  SubscriptionRuntime,
} from 'src/subscriptions/types';

describe('PlanGuard', () => {
  const usersService = {
    findById: jest.fn(),
  };
  const plansService = {
    getActualByUserId: jest.fn(),
    updatePlan: jest.fn(),
  };
  const planGateway = {
    emitPlanStatusChanged: jest.fn(),
  };
  const subscriptionsService = {
    getCurrentUserSubscription: jest.fn(),
    refreshEffectiveAccessState: jest.fn(),
  };

  let guard: PlanGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    (subscriptionsService.getCurrentUserSubscription as any).mockResolvedValue({
      subscription: null,
    });
    (subscriptionsService.refreshEffectiveAccessState as any).mockResolvedValue({
      subscription: null,
    });
    guard = new PlanGuard(
      usersService as any,
      plansService as any,
      planGateway as any,
      subscriptionsService as any,
    );
  });

  function httpContext(userId?: number) {
    return {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({
          user: userId ? { id: userId } : undefined,
        }),
      }),
    } as any;
  }

  function wsContext(userId?: number, emit = jest.fn()) {
    return {
      getType: () => 'ws',
      switchToWs: () => ({
        getClient: () => ({
          user: userId ? { id: userId } : undefined,
          emit,
          disconnect: jest.fn(),
        }),
      }),
    } as any;
  }

  function activePlan(overrides: Record<string, unknown> = {}) {
    return {
      id: 58,
      userId: 167,
      basePlanId: BasePlanIds.BASE_M1,
      planStatus: PlanStatus.ACTIVE,
      actual: true,
      expiryTime: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      creditsLimit: 100,
      usedCredits: 10,
      ...overrides,
    };
  }

  it('allows HTTP requests for active non-expired plans within credit limit', async () => {
    (usersService.findById as any).mockResolvedValueOnce({ id: 167 });
    (plansService.getActualByUserId as any).mockResolvedValueOnce({
      plan: activePlan(),
    });

    await expect(guard.canActivate(httpContext(167))).resolves.toBe(true);

    expect(plansService.updatePlan).not.toHaveBeenCalled();
    expect(planGateway.emitPlanStatusChanged).not.toHaveBeenCalled();
  });

  it('throws when the user has no actual plan', async () => {
    (usersService.findById as any).mockResolvedValueOnce({ id: 167 });
    (plansService.getActualByUserId as any).mockResolvedValueOnce({
      plan: null,
    });

    await expect(guard.canActivate(httpContext(167))).rejects.toThrow(
      HttpException,
    );
  });

  it('allows canceled plans until their expiry time passes', async () => {
    (usersService.findById as any).mockResolvedValueOnce({ id: 167 });
    (plansService.getActualByUserId as any).mockResolvedValueOnce({
      plan: activePlan({
        planStatus: PlanStatus.CANCELED,
        expiryTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }),
    });

    await expect(guard.canActivate(httpContext(167))).resolves.toBe(true);
  });

  it('expires a trial plan after expiryTime and emits plan status changes', async () => {
    (usersService.findById as any).mockResolvedValueOnce({ id: 167 });
    (plansService.getActualByUserId as any).mockResolvedValueOnce({
      plan: activePlan({
        basePlanId: BasePlanIds.START,
        expiryTime: new Date(Date.now() - 60 * 1000),
      }),
    });

    await expect(guard.canActivate(httpContext(167))).rejects.toThrow(
      HttpException,
    );

    expect(plansService.updatePlan).toHaveBeenCalledWith(58, {
      planStatus: PlanStatus.EXPIRED,
    });
    expect(planGateway.emitPlanStatusChanged).toHaveBeenCalledWith(167);
  });

  it('expires paid plans only after the three-day grace window', async () => {
    (usersService.findById as any).mockResolvedValueOnce({ id: 167 });
    (plansService.getActualByUserId as any).mockResolvedValueOnce({
      plan: activePlan({
        basePlanId: BasePlanIds.BASE_M1,
        expiryTime: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      }),
    });

    await expect(guard.canActivate(httpContext(167))).rejects.toThrow(
      HttpException,
    );

    expect(plansService.updatePlan).toHaveBeenCalledWith(58, {
      planStatus: PlanStatus.EXPIRED,
    });
    expect(planGateway.emitPlanStatusChanged).toHaveBeenCalledWith(167);
  });

  it('does not expire paid plans inside the three-day grace window', async () => {
    (usersService.findById as any).mockResolvedValueOnce({ id: 167 });
    (plansService.getActualByUserId as any).mockResolvedValueOnce({
      plan: activePlan({
        basePlanId: BasePlanIds.BASE_M1,
        expiryTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      }),
    });

    await expect(guard.canActivate(httpContext(167))).resolves.toBe(true);

    expect(plansService.updatePlan).not.toHaveBeenCalled();
  });

  it('marks plans as credit exceeded when used credits reach the limit', async () => {
    (usersService.findById as any).mockResolvedValueOnce({ id: 167 });
    (plansService.getActualByUserId as any).mockResolvedValueOnce({
      plan: activePlan({
        creditsLimit: 100,
        usedCredits: 100,
      }),
    });

    await expect(guard.canActivate(httpContext(167))).rejects.toThrow(
      HttpException,
    );

    expect(plansService.updatePlan).toHaveBeenCalledWith(58, {
      planStatus: PlanStatus.CREDIT_EXCEEDED,
    });
    expect(planGateway.emitPlanStatusChanged).toHaveBeenCalledWith(167);
  });

  it('allows legacy-runtime users through V2 state when no legacy actual plan exists', async () => {
    (usersService.findById as any).mockResolvedValueOnce({
      id: 167,
      subscriptionRuntime: SubscriptionRuntime.LEGACY_COMPAT,
    });
    (plansService.getActualByUserId as any).mockResolvedValueOnce({
      plan: null,
    });
    (subscriptionsService.getCurrentUserSubscription as any)
      .mockResolvedValueOnce({
        subscription: {
          userId: 167,
          basePlanId: BasePlanIds.START,
          accessStatus: SubscriptionAccessStatus.ACTIVE,
          metadata: { accessReason: SubscriptionAccessReason.NONE },
        },
      });
    (subscriptionsService.refreshEffectiveAccessState as any)
      .mockResolvedValueOnce({ subscription: null });

    await expect(guard.canActivate(httpContext(167))).resolves.toBe(true);

    expect(plansService.updatePlan).not.toHaveBeenCalled();
  });

  it('allows V2 users through the new user plan state without reading legacy plans', async () => {
    (usersService.findById as any).mockResolvedValueOnce({
      id: 167,
      subscriptionRuntime: SubscriptionRuntime.V2,
    });
    (subscriptionsService.getCurrentUserSubscription as any)
      .mockResolvedValueOnce({
        subscription: {
          userId: 167,
          accessStatus: SubscriptionAccessStatus.ACTIVE,
          metadata: { accessReason: SubscriptionAccessReason.NONE },
        },
      });
    (subscriptionsService.refreshEffectiveAccessState as any)
      .mockResolvedValueOnce({
        subscription: {
          userId: 167,
          accessStatus: SubscriptionAccessStatus.ACTIVE,
          metadata: { accessReason: SubscriptionAccessReason.NONE },
        },
      });

    await expect(guard.canActivate(httpContext(167))).resolves.toBe(true);

    expect(plansService.getActualByUserId).not.toHaveBeenCalled();
  });

  it('blocks V2 users when the new user plan state is credit limited', async () => {
    (usersService.findById as any).mockResolvedValueOnce({
      id: 167,
      subscriptionRuntime: SubscriptionRuntime.V2,
    });
    (subscriptionsService.getCurrentUserSubscription as any)
      .mockResolvedValueOnce({
        subscription: {
          userId: 167,
          basePlanId: BasePlanIds.LITE_M1,
          accessStatus: SubscriptionAccessStatus.LIMITED,
          metadata: {
            accessReason: SubscriptionAccessReason.CREDIT_EXCEEDED,
          },
        },
      });
    (subscriptionsService.refreshEffectiveAccessState as any)
      .mockResolvedValueOnce({
        subscription: {
          userId: 167,
          basePlanId: BasePlanIds.LITE_M1,
          accessStatus: SubscriptionAccessStatus.LIMITED,
          metadata: {
            accessReason: SubscriptionAccessReason.CREDIT_EXCEEDED,
          },
        },
      });

    await expect(guard.canActivate(httpContext(167))).rejects.toThrow(
      HttpException,
    );

    expect(plansService.getActualByUserId).not.toHaveBeenCalled();
  });

  it('blocks V2 canceled subscriptions after refresh marks the paid period expired', async () => {
    (usersService.findById as any).mockResolvedValueOnce({
      id: 167,
      subscriptionRuntime: SubscriptionRuntime.V2,
    });
    (subscriptionsService.refreshEffectiveAccessState as any)
      .mockResolvedValueOnce({
        subscription: {
          userId: 167,
          basePlanId: BasePlanIds.BASE_M1,
          accessStatus: SubscriptionAccessStatus.LIMITED,
          metadata: {
            accessReason: SubscriptionAccessReason.SUBSCRIPTION_CANCELED,
          },
        },
      });

    await expect(guard.canActivate(httpContext(167))).rejects.toMatchObject({
      response: expect.objectContaining({
        statusCode: HttpStatus.PLAN_WAS_CANCELED,
        statusMessage: 'Subscription was canceled',
        code: 'SUBSCRIPTION_WAS_CANCELED',
      }),
    });

    expect(plansService.getActualByUserId).not.toHaveBeenCalled();
  });

  it('blocks V2 paused subscriptions with a paused subscription error', async () => {
    (usersService.findById as any).mockResolvedValueOnce({
      id: 167,
      subscriptionRuntime: SubscriptionRuntime.V2,
    });
    (subscriptionsService.refreshEffectiveAccessState as any)
      .mockResolvedValueOnce({
        subscription: {
          userId: 167,
          basePlanId: BasePlanIds.BASE_M1,
          accessStatus: SubscriptionAccessStatus.LIMITED,
          metadata: {
            accessReason: SubscriptionAccessReason.BILLING_PAUSED,
          },
        },
      });

    await expect(guard.canActivate(httpContext(167))).rejects.toMatchObject({
      response: expect.objectContaining({
        statusCode: HttpStatus.PLAN_PAUSED,
        statusMessage: 'Subscription is paused',
        code: 'SUBSCRIPTION_PAUSED',
      }),
    });

    expect(plansService.getActualByUserId).not.toHaveBeenCalled();
  });

  it.each([
    {
      reason: SubscriptionAccessReason.CREDIT_EXCEEDED,
      statusCode: HttpStatus.CREDIT_LIMIT_EXCEEDED,
      errorCode: 'CREDIT_LIMIT_EXCEEDED',
      statusMessage: 'Credit Limit Exceeded',
    },
    {
      reason: SubscriptionAccessReason.TRIAL_EXPIRED,
      statusCode: HttpStatus.TRIAL_PLAN_HAS_EXPIRED,
      errorCode: 'TRIAL_PERIOD_HAS_EXPIRED',
      statusMessage: 'Trial period has expired',
    },
    {
      reason: SubscriptionAccessReason.SUBSCRIPTION_EXPIRED,
      statusCode: HttpStatus.PLAN_HAS_EXPIRED,
      errorCode: 'SUBSCRIPTION_HAS_EXPIRED',
      statusMessage: 'Subscription has expired',
    },
    {
      reason: SubscriptionAccessReason.SUBSCRIPTION_CANCELED,
      statusCode: HttpStatus.PLAN_WAS_CANCELED,
      errorCode: 'SUBSCRIPTION_WAS_CANCELED',
      statusMessage: 'Subscription was canceled',
    },
    {
      reason: SubscriptionAccessReason.BILLING_PENDING,
      statusCode: HttpStatus.PLAN_WAS_PENDING,
      errorCode: 'SUBSCRIPTION_HAS_PENDING',
      statusMessage: 'Subscription has pending',
    },
    {
      reason: SubscriptionAccessReason.BILLING_ON_HOLD,
      statusCode: HttpStatus.PLAN_ON_HOLD,
      errorCode: 'SUBSCRIPTION_ON_HOLD',
      statusMessage: 'Subscription is on hold',
    },
    {
      reason: SubscriptionAccessReason.BILLING_PAUSED,
      statusCode: HttpStatus.PLAN_PAUSED,
      errorCode: 'SUBSCRIPTION_PAUSED',
      statusMessage: 'Subscription is paused',
    },
    {
      reason: SubscriptionAccessReason.SUBSCRIPTION_REFUNDED,
      statusCode: HttpStatus.PLAN_REFUNDED,
      errorCode: 'SUBSCRIPTION_REFUNDED',
      statusMessage: 'Subscription was refunded',
    },
    {
      reason: SubscriptionAccessReason.ADMIN_DISABLED,
      statusCode: HttpStatus.PLAN_IS_INACTIVE,
      errorCode: 'SUBSCRIPTION_NOT_ACTIVE',
      statusMessage: 'Subscription is not active',
    },
  ])(
    'returns legacy-compatible HTTP plan errors for V2 reason $reason',
    async ({ reason, statusCode, errorCode, statusMessage }) => {
      (usersService.findById as any).mockResolvedValueOnce({
        id: 167,
        subscriptionRuntime: SubscriptionRuntime.V2,
      });
      (subscriptionsService.refreshEffectiveAccessState as any)
        .mockResolvedValueOnce({
          subscription: {
            userId: 167,
            basePlanId: BasePlanIds.BASE_M1,
            accessStatus: SubscriptionAccessStatus.LIMITED,
            metadata: { accessReason: reason },
          },
        });

      await expect(guard.canActivate(httpContext(167))).rejects.toMatchObject({
        response: expect.objectContaining({
          statusCode,
          statusMessage,
          code: errorCode,
          data: { basePlanId: BasePlanIds.BASE_M1 },
        }),
      });

      expect(plansService.getActualByUserId).not.toHaveBeenCalled();
    },
  );

  it('emits legacy-compatible socket plan_error payloads for V2 credit limits', async () => {
    const emit = jest.fn();
    (usersService.findById as any).mockResolvedValueOnce({
      id: 167,
      subscriptionRuntime: SubscriptionRuntime.V2,
    });
    (subscriptionsService.refreshEffectiveAccessState as any)
      .mockResolvedValueOnce({
        subscription: {
          userId: 167,
          basePlanId: BasePlanIds.LITE_M1,
          accessStatus: SubscriptionAccessStatus.LIMITED,
          metadata: {
            accessReason: SubscriptionAccessReason.CREDIT_EXCEEDED,
          },
        },
      });

    await expect(guard.canActivate(wsContext(167, emit))).resolves.toBe(false);

    expect(emit).toHaveBeenCalledWith('plan_error', {
      statusMessage: 'creditLimitExceeded_lite-m1',
      message: 'creditLimitExceeded_lite-m1',
      code: HttpStatus.CREDIT_LIMIT_EXCEEDED,
      basePlanId: BasePlanIds.LITE_M1,
    });
  });

  it('emits legacy-compatible socket plan_error payloads for V2 paused subscriptions', async () => {
    const emit = jest.fn();
    (usersService.findById as any).mockResolvedValueOnce({
      id: 167,
      subscriptionRuntime: SubscriptionRuntime.V2,
    });
    (subscriptionsService.refreshEffectiveAccessState as any)
      .mockResolvedValueOnce({
        subscription: {
          userId: 167,
          basePlanId: BasePlanIds.BASE_M1,
          accessStatus: SubscriptionAccessStatus.LIMITED,
          metadata: {
            accessReason: SubscriptionAccessReason.BILLING_PAUSED,
          },
        },
      });

    await expect(guard.canActivate(wsContext(167, emit))).resolves.toBe(false);

    expect(emit).toHaveBeenCalledWith('plan_error', {
      statusMessage: 'subscriptionPaused',
      message: 'yourSubscriptionPausedPleaseRenewYourSubscription',
      code: HttpStatus.PLAN_PAUSED,
      basePlanId: BasePlanIds.BASE_M1,
    });
  });
});
