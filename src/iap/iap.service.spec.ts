import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { HttpException } from '@nestjs/common';
import { IapService } from './iap.service';
import { BasePlanIds, PlanStatus, SubscriptionIds } from 'src/plans/types';
import { Platform } from 'src/common/types/platform';

describe('IapService', () => {
  const plansService = {
    subscribePlan: jest.fn(),
    findExistingPlanForIap: jest.fn(),
    updatePlan: jest.fn(),
    updatePlanFromGooglePubSub: jest.fn(),
    getActualByUserId: jest.fn(),
  };
  const paymentsService = {
    create: jest.fn(),
  };
  const usersService = {
    findById: jest.fn(),
  };
  const planGateway = {
    emitPlanStatusChanged: jest.fn(),
  };
  const paidPlanEventsService = {
    info: jest.fn(),
    warning: jest.fn(),
    conflict: jest.fn(),
  };

  let service: IapService;
  let googleGet: jest.Mock;
  let consoleLogSpy: jest.SpiedFunction<typeof console.log>;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    service = new IapService(
      plansService as any,
      paymentsService as any,
      usersService as any,
      planGateway as any,
      paidPlanEventsService as any,
    );
    googleGet = jest.fn() as any;
    (service as any).android = {
      purchases: {
        subscriptionsv2: {
          get: googleGet,
        },
      },
    };
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  function googleSubResponse(overrides: Record<string, any> = {}) {
    return {
      data: {
        startTime: '2026-06-25T15:00:00.000Z',
        regionCode: 'UA',
        subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        linkedPurchaseToken: null,
        lineItems: [
          {
            productId: SubscriptionIds.NEMORY,
            expiryTime: '2026-07-25T15:00:00.000Z',
            latestSuccessfulOrderId: 'GPA.new',
            offerDetails: { basePlanId: BasePlanIds.BASE_M1 },
            autoRenewingPlan: {
              autoRenewEnabled: true,
              recurringPrice: {
                currencyCode: 'UAH',
                units: '394',
                nanos: 990000000,
              },
            },
          },
        ],
        ...overrides,
      },
    };
  }

  it('maps Google subscription data into local plan and payment data', async () => {
    (googleGet as any).mockResolvedValueOnce(googleSubResponse());

    const result = await service.verifyAndroidSub('app.package', 'token-1');

    expect(googleGet).toHaveBeenCalledWith({
      packageName: 'app.package',
      token: 'token-1',
    });
    expect(result.planData).toEqual(
      expect.objectContaining({
        platform: Platform.ANDROID,
        regionCode: 'UA',
        subscriptionId: SubscriptionIds.NEMORY,
        basePlanId: BasePlanIds.BASE_M1,
        planStatus: PlanStatus.ACTIVE,
        purchaseToken: 'token-1',
        price: 394.99,
        currency: 'UAH',
        lastOrderId: 'GPA.new',
      }),
    );
    expect(result.paymentData).toEqual(
      expect.objectContaining({
        orderId: 'GPA.new',
        amount: 394.99,
        currency: 'UAH',
      }),
    );
  });

  it('silently ignores Pub/Sub unknown purchase tokens without updating plans or logging paid-plan events', async () => {
    (googleGet as any).mockResolvedValueOnce(googleSubResponse());
    (plansService.findExistingPlanForIap as any).mockResolvedValueOnce(null);

    await service.pubSubAndroid('app.package', 'unknown-token', 2);

    expect(paidPlanEventsService.info).not.toHaveBeenCalled();
    expect(paidPlanEventsService.warning).not.toHaveBeenCalled();
    expect(paidPlanEventsService.conflict).not.toHaveBeenCalled();
    expect(plansService.updatePlan).not.toHaveBeenCalled();
    expect(plansService.updatePlanFromGooglePubSub).not.toHaveBeenCalled();
    expect(paymentsService.create).not.toHaveBeenCalled();
  });

  it('updates an existing Pub/Sub plan, resets credits for a new order, emits gateway, and creates payment', async () => {
    (googleGet as any).mockResolvedValueOnce(googleSubResponse());
    (plansService.findExistingPlanForIap as any).mockResolvedValueOnce({
      id: 58,
      userId: 167,
      user: { id: 167 },
      basePlanId: BasePlanIds.LITE_M1,
      planStatus: PlanStatus.ACTIVE,
      expiryTime: new Date('2026-07-20T15:00:00.000Z'),
      lastOrderId: 'GPA.old',
    });
    (plansService.updatePlanFromGooglePubSub as any).mockResolvedValueOnce({
      id: 58,
      userId: 167,
      basePlanId: BasePlanIds.BASE_M1,
    });
    (usersService.findById as any).mockResolvedValueOnce({ id: 167 });
    (paymentsService.create as any).mockResolvedValueOnce({ id: 1 });

    const result = await service.pubSubAndroid('app.package', 'known-token', 2);

    expect(result).toBe(true);
    expect(plansService.updatePlanFromGooglePubSub).toHaveBeenCalledWith(
      58,
      167,
      expect.objectContaining({
        purchaseToken: 'known-token',
        lastOrderId: 'GPA.new',
        basePlanId: BasePlanIds.BASE_M1,
      }),
      {
        resetUsedCredits: true,
        lastOrderId: 'GPA.new',
        restoreActual: true,
      },
    );
    expect(plansService.updatePlan).not.toHaveBeenCalled();
    expect(planGateway.emitPlanStatusChanged).toHaveBeenCalledWith(167);
    expect(paymentsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'GPA.new',
        user: { id: 167 },
        plan: expect.objectContaining({ id: 58 }),
      }),
    );
    expect(paidPlanEventsService.info).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PUBSUB_PAYMENT_CREATED',
        userId: 167,
        planId: 58,
      }),
    );
  });

  it('uses existingPlan.userId as Pub/Sub fallback when user relation is missing', async () => {
    (googleGet as any).mockResolvedValueOnce(googleSubResponse());
    (plansService.findExistingPlanForIap as any).mockResolvedValueOnce({
      id: 58,
      userId: 167,
      basePlanId: BasePlanIds.LITE_M1,
      planStatus: PlanStatus.ACTIVE,
      expiryTime: new Date('2026-07-20T15:00:00.000Z'),
      lastOrderId: 'GPA.old',
    });
    (plansService.updatePlanFromGooglePubSub as any).mockResolvedValueOnce({
      id: 58,
      userId: 167,
      basePlanId: BasePlanIds.BASE_M1,
    });
    (usersService.findById as any).mockResolvedValueOnce({ id: 167 });
    (paymentsService.create as any).mockResolvedValueOnce({ id: 1 });

    const result = await service.pubSubAndroid('app.package', 'known-token', 2);

    expect(result).toBe(true);
    expect(plansService.updatePlanFromGooglePubSub).toHaveBeenCalledWith(
      58,
      167,
      expect.any(Object),
      expect.objectContaining({ restoreActual: true }),
    );
    expect(planGateway.emitPlanStatusChanged).toHaveBeenCalledWith(167);
    expect(usersService.findById).toHaveBeenCalledWith(167);
    expect(paidPlanEventsService.info).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PUBSUB_PAYMENT_CREATED',
        userId: 167,
        planId: 58,
      }),
    );
  });

  it('does not create a Pub/Sub payment when the order id did not change', async () => {
    (googleGet as any).mockResolvedValueOnce(googleSubResponse());
    (plansService.findExistingPlanForIap as any).mockResolvedValueOnce({
      id: 58,
      userId: 167,
      user: { id: 167 },
      basePlanId: BasePlanIds.BASE_M1,
      planStatus: PlanStatus.ACTIVE,
      expiryTime: new Date('2026-07-20T15:00:00.000Z'),
      lastOrderId: 'GPA.new',
    });
    (plansService.updatePlanFromGooglePubSub as any).mockResolvedValueOnce({
      id: 58,
      userId: 167,
      basePlanId: BasePlanIds.BASE_M1,
    });

    await service.pubSubAndroid('app.package', 'known-token', 2);

    expect(plansService.updatePlanFromGooglePubSub).toHaveBeenCalledWith(
      58,
      167,
      expect.any(Object),
      {
        resetUsedCredits: false,
        lastOrderId: 'GPA.new',
        restoreActual: true,
      },
    );
    expect(usersService.findById).not.toHaveBeenCalled();
    expect(paymentsService.create).not.toHaveBeenCalled();
  });

  it('does not restore actual flag for expired Pub/Sub subscription states', async () => {
    (googleGet as any).mockResolvedValueOnce(
      googleSubResponse({
        subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED',
      }),
    );
    (plansService.findExistingPlanForIap as any).mockResolvedValueOnce({
      id: 58,
      userId: 167,
      user: { id: 167 },
      basePlanId: BasePlanIds.BASE_M1,
      planStatus: PlanStatus.ACTIVE,
      expiryTime: new Date('2026-07-20T15:00:00.000Z'),
      lastOrderId: 'GPA.new',
    });
    (plansService.updatePlan as any).mockResolvedValueOnce({
      id: 58,
      userId: 167,
      basePlanId: BasePlanIds.BASE_M1,
    });

    await service.pubSubAndroid('app.package', 'known-token', 13);

    expect(plansService.updatePlan).toHaveBeenCalledWith(
      58,
      expect.objectContaining({
        planStatus: PlanStatus.EXPIRED,
      }),
      {
        resetUsedCredits: false,
        lastOrderId: 'GPA.new',
      },
    );
    expect(plansService.updatePlanFromGooglePubSub).not.toHaveBeenCalled();
    expect(planGateway.emitPlanStatusChanged).toHaveBeenCalledWith(167);
  });

  it('logs Google verify failures for frontend create-sub as conflicts', async () => {
    const verifyError = new Error('Google unavailable');
    (googleGet as any).mockRejectedValueOnce(verifyError);

    await expect(
      service.createAndroidSub(167, 'app.package', 'bad-token'),
    ).rejects.toThrow('Google unavailable');

    expect(paidPlanEventsService.conflict).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'IAP_CREATE_SUB_GOOGLE_VERIFY_FAILED',
        userId: 167,
        purchaseToken: 'bad-token',
        metadata: expect.objectContaining({
          errorMessage: 'Google unavailable',
        }),
      }),
    );
    expect(plansService.subscribePlan).not.toHaveBeenCalled();
  });

  it('logs Google verify failures for Pub/Sub as conflicts', async () => {
    const verifyError = new Error('Google unavailable');
    (googleGet as any).mockRejectedValueOnce(verifyError);

    await expect(
      service.pubSubAndroid('app.package', 'bad-token', 2),
    ).rejects.toThrow('Google unavailable');

    expect(paidPlanEventsService.conflict).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PUBSUB_GOOGLE_VERIFY_FAILED',
        purchaseToken: 'bad-token',
        metadata: expect.objectContaining({
          errorMessage: 'Google unavailable',
        }),
      }),
    );
    expect(plansService.findExistingPlanForIap).not.toHaveBeenCalled();
  });

  it('maps unknown Google subscription states to EXPIRED', async () => {
    (googleGet as any).mockResolvedValueOnce(
      googleSubResponse({
        subscriptionState: 'SUBSCRIPTION_STATE_UNKNOWN_FUTURE_STATE',
      }),
    );

    const result = await service.verifyAndroidSub('app.package', 'token-1');

    expect(result.planData.planStatus).toBe(PlanStatus.EXPIRED);
  });

  it('warns but still creates a new plan when frontend create-sub replaces an active paid plan', async () => {
    (googleGet as any)
      .mockResolvedValueOnce(
        googleSubResponse({
          linkedPurchaseToken: 'old-token',
          lineItems: [
            {
              productId: SubscriptionIds.NEMORY,
              expiryTime: '2026-07-25T15:00:00.000Z',
              latestSuccessfulOrderId: 'GPA.new',
              offerDetails: { basePlanId: BasePlanIds.BASE_M1 },
              autoRenewingPlan: {
                autoRenewEnabled: true,
                recurringPrice: {
                  currencyCode: 'UAH',
                  units: '394',
                  nanos: 990000000,
                },
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        googleSubResponse({
          lineItems: [
            {
              productId: SubscriptionIds.NEMORY,
              expiryTime: '2026-07-20T15:00:00.000Z',
              latestSuccessfulOrderId: 'GPA.old',
              offerDetails: { basePlanId: BasePlanIds.LITE_M1 },
              autoRenewingPlan: {
                autoRenewEnabled: true,
                recurringPrice: {
                  currencyCode: 'UAH',
                  units: '199',
                  nanos: 990000000,
                },
              },
            },
          ],
        }),
      );
    (usersService.findById as any).mockResolvedValueOnce({ id: 167 });
    (plansService.getActualByUserId as any).mockResolvedValueOnce({
      plan: {
        id: 58,
        userId: 167,
        basePlanId: BasePlanIds.LITE_M1,
        planStatus: PlanStatus.ACTIVE,
        actual: true,
        purchaseToken: 'old-token',
        lastOrderId: 'GPA.old',
        expiryTime: new Date('2026-07-20T15:00:00.000Z'),
      },
    });
    (plansService.subscribePlan as any).mockResolvedValueOnce({
      plan: { id: 59, userId: 167 },
    });
    (paymentsService.create as any).mockResolvedValueOnce({ id: 1 });

    const result = await service.createAndroidSub(
      167,
      'app.package',
      'new-token',
    );

    expect(result).toEqual({ id: 59, userId: 167 });
    expect(paidPlanEventsService.warning).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'IAP_CREATE_SUB_REPLACES_ACTIVE_PAID_PLAN',
        userId: 167,
        oldPlanId: 58,
        purchaseToken: 'new-token',
        oldOrderId: 'GPA.old',
      }),
    );
    expect(plansService.subscribePlan).toHaveBeenCalledWith(
      167,
      expect.objectContaining({
        purchaseToken: 'new-token',
        linkedPurchaseToken: 'old-token',
        basePlanId: BasePlanIds.BASE_M1,
      }),
    );
    expect(paymentsService.create).toHaveBeenCalled();
  });

  it('ignores unlinked legacy create-sub tokens when the user already has an active paid plan', async () => {
    const currentPlan = {
      id: 58,
      userId: 167,
      basePlanId: BasePlanIds.LITE_M1,
      planStatus: PlanStatus.ACTIVE,
      actual: true,
      purchaseToken: 'old-token',
      lastOrderId: 'GPA.old',
      expiryTime: new Date('2026-07-20T15:00:00.000Z'),
    };

    (googleGet as any)
      .mockResolvedValueOnce(
        googleSubResponse({
          linkedPurchaseToken: null,
          lineItems: [
            {
              productId: SubscriptionIds.NEMORY,
              expiryTime: '2026-07-05T14:20:39.000Z',
              latestSuccessfulOrderId: 'GPA.foreign',
              offerDetails: { basePlanId: BasePlanIds.LITE_M1 },
              autoRenewingPlan: {
                autoRenewEnabled: true,
                recurringPrice: {
                  currencyCode: 'UAH',
                  units: '199',
                  nanos: 990000000,
                },
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        googleSubResponse({
          lineItems: [
            {
              productId: SubscriptionIds.NEMORY,
              expiryTime: '2026-07-20T15:00:00.000Z',
              latestSuccessfulOrderId: 'GPA.old',
              offerDetails: { basePlanId: BasePlanIds.LITE_M1 },
              autoRenewingPlan: {
                autoRenewEnabled: true,
                recurringPrice: {
                  currencyCode: 'UAH',
                  units: '199',
                  nanos: 990000000,
                },
              },
            },
          ],
        }),
      );
    (usersService.findById as any).mockResolvedValueOnce({ id: 167 });
    (plansService.getActualByUserId as any).mockResolvedValueOnce({
      plan: currentPlan,
    });

    const result = await service.createAndroidSub(
      167,
      'app.package',
      'foreign-token',
    );

    expect(result).toBe(currentPlan);
    expect(paidPlanEventsService.warning).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'IAP_CREATE_SUB_IGNORED_ACTIVE_PAID_PLAN_MISMATCH',
        userId: 167,
        oldPlanId: 58,
        purchaseToken: 'foreign-token',
        orderId: 'GPA.foreign',
        oldOrderId: 'GPA.old',
      }),
    );
    expect(plansService.subscribePlan).not.toHaveBeenCalled();
    expect(paymentsService.create).not.toHaveBeenCalled();
  });

  it('logs payment creation failures after frontend create-sub without failing the plan creation', async () => {
    (googleGet as any).mockResolvedValueOnce(googleSubResponse());
    (usersService.findById as any).mockResolvedValueOnce({ id: 167 });
    (plansService.getActualByUserId as any).mockResolvedValueOnce({
      plan: null,
    });
    (plansService.subscribePlan as any).mockResolvedValueOnce({
      plan: { id: 59, userId: 167 },
    });
    (paymentsService.create as any).mockRejectedValueOnce(
      new Error('payment db failed'),
    );
    const consoleWarnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => {});

    const result = await service.createAndroidSub(
      167,
      'app.package',
      'new-token',
    );

    expect(result).toEqual({ id: 59, userId: 167 });
    expect(paidPlanEventsService.warning).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'IAP_CREATE_SUB_PAYMENT_CREATE_FAILED',
        userId: 167,
        planId: 59,
        metadata: expect.objectContaining({
          errorMessage: 'payment db failed',
        }),
      }),
    );
    consoleWarnSpy.mockRestore();
  });

  it('logs existing-plan Google verify failures but still continues frontend create-sub', async () => {
    (googleGet as any)
      .mockResolvedValueOnce(
        googleSubResponse({
          linkedPurchaseToken: 'old-token',
        }),
      )
      .mockRejectedValueOnce(new Error('old token verify failed'));
    (usersService.findById as any).mockResolvedValueOnce({ id: 167 });
    (plansService.getActualByUserId as any).mockResolvedValueOnce({
      plan: {
        id: 58,
        userId: 167,
        basePlanId: BasePlanIds.LITE_M1,
        planStatus: PlanStatus.ACTIVE,
        actual: true,
        purchaseToken: 'old-token',
        lastOrderId: 'GPA.old',
        expiryTime: new Date('2026-07-20T15:00:00.000Z'),
      },
    });
    (plansService.subscribePlan as any).mockResolvedValueOnce({
      plan: { id: 59, userId: 167 },
    });
    (paymentsService.create as any).mockResolvedValueOnce({ id: 1 });

    const result = await service.createAndroidSub(
      167,
      'app.package',
      'new-token',
    );

    expect(result).toEqual({ id: 59, userId: 167 });
    expect(paidPlanEventsService.conflict).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'IAP_CREATE_SUB_EXISTING_PLAN_GOOGLE_VERIFY_FAILED',
        userId: 167,
        oldPlanId: 58,
        purchaseToken: 'old-token',
        metadata: expect.objectContaining({
          errorMessage: 'old token verify failed',
        }),
      }),
    );
    expect(plansService.subscribePlan).toHaveBeenCalledWith(
      167,
      expect.objectContaining({ purchaseToken: 'new-token' }),
    );
  });

  it('does not warn when frontend create-sub receives the same token as current actual plan', async () => {
    (googleGet as any).mockResolvedValueOnce(googleSubResponse());
    (usersService.findById as any).mockResolvedValueOnce({ id: 167 });
    (plansService.getActualByUserId as any).mockResolvedValueOnce({
      plan: {
        id: 58,
        userId: 167,
        basePlanId: BasePlanIds.BASE_M1,
        planStatus: PlanStatus.ACTIVE,
        actual: true,
        purchaseToken: 'same-token',
        lastOrderId: 'GPA.new',
      },
    });
    (plansService.subscribePlan as any).mockResolvedValueOnce({
      plan: { id: 58, userId: 167 },
    });
    (paymentsService.create as any).mockResolvedValueOnce({ id: 1 });

    await service.createAndroidSub(167, 'app.package', 'same-token');

    expect(paidPlanEventsService.warning).not.toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'IAP_CREATE_SUB_REPLACES_ACTIVE_PAID_PLAN',
      }),
    );
  });

  it('preserves subscription conflicts from plan creation instead of masking them as generic create-sub errors', async () => {
    const subscriptionConflict = new HttpException(
      {
        statusCode: 409,
        statusMessage: 'Subscription already belongs to another user',
        message: 'This subscription is already linked to another active account.',
        code: 'SUBSCRIPTION_ALREADY_LINKED',
      },
      409,
    );
    (googleGet as any).mockResolvedValueOnce(googleSubResponse());
    (usersService.findById as any).mockResolvedValueOnce({ id: 167 });
    (plansService.getActualByUserId as any).mockResolvedValueOnce({
      plan: null,
    });
    (plansService.subscribePlan as any).mockRejectedValueOnce(
      subscriptionConflict,
    );
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    await expect(
      service.createAndroidSub(167, 'app.package', 'new-token'),
    ).rejects.toBe(subscriptionConflict);

    expect(paidPlanEventsService.conflict).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'IAP_CREATE_SUB_FAILED',
        userId: 167,
        purchaseToken: 'new-token',
        metadata: expect.objectContaining({
          errorMessage:
            'This subscription is already linked to another active account.',
        }),
      }),
    );
    consoleErrorSpy.mockRestore();
  });
});
