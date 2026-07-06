import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SubscriptionsService } from './subscriptions.service';
import { User } from 'src/users/entities/user.entity';
import { UserPlanState } from './entities/user-plan-state.entity';
import { StoreSubscription } from './entities/store-subscription.entity';
import {
  SubscriptionAccessStatus,
  SubscriptionAccessReason,
  SubscriptionBasePlanId,
  SubscriptionBillingStatus,
  SubscriptionProductId,
  SubscriptionRuntime,
  SubscriptionSource,
  StoreSubscriptionProvider,
} from './types';
import { Platform } from 'src/common/types/platform';

describe('SubscriptionsService', () => {
  const dataSource = {
    transaction: jest.fn(),
  };
  const plansRepository = {
    findOne: jest.fn(),
  };
  const userPlanStatesRepository = {
    findOne: jest.fn(),
  };
  const storeSubscriptionsRepository = {
    findOne: jest.fn(),
  };
  const googlePlaySubscriptionsService = {
    verifyAndroidSubscription: jest.fn(),
  };
  const paidPlanEventsService = {
    info: jest.fn(),
    warning: jest.fn(),
    conflict: jest.fn(),
  };
  const legacyMapper = {
    toStoreSubscriptionDraft: jest.fn(),
    toUserPlanStateDraft: jest.fn(),
  };

  let service: SubscriptionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SubscriptionsService(
      dataSource as any,
      plansRepository as any,
      userPlanStatesRepository as any,
      storeSubscriptionsRepository as any,
      googlePlaySubscriptionsService as any,
      paidPlanEventsService as any,
      legacyMapper as any,
    );
  });

  function createManager(overrides: Partial<Record<string, jest.Mock>> = {}) {
    return {
      findOne: jest.fn(),
      create: jest.fn((_entity: any, payload: any) => ({
        id: 10,
        ...payload,
      })),
      merge: jest.fn((_entity: any, target: any, payload: any) =>
        Object.assign(target, payload),
      ),
      save: jest.fn(async (_entity: any, payload: any) => payload),
      ...overrides,
    };
  }

  function verifiedGooglePlaySubscription(
    overrides: Record<string, any> = {},
  ) {
    return {
      storeData: {
        platform: Platform.ANDROID,
        regionCode: 'UA',
        productId: SubscriptionProductId.NEMORY,
        basePlanId: SubscriptionBasePlanId.LITE_M1,
        purchaseToken: 'purchase-token',
        linkedPurchaseToken: null,
        lastOrderId: 'GPA.new',
        storeStatus: SubscriptionBillingStatus.ACTIVE,
        startTime: new Date('2026-06-26T10:00:00.000Z'),
        expiryTime: new Date('2026-07-26T10:00:00.000Z'),
        autoRenewEnabled: true,
        price: 394.99,
        currency: 'UAH',
        ...overrides.storeData,
      },
      paymentData: {
        platform: Platform.ANDROID,
        regionCode: 'UA',
        orderId: 'GPA.new',
        amount: 394.99,
        currency: 'UAH',
      },
      googleData: {
        subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        ...overrides.googleData,
      },
    };
  }

  it('returns the current subscription state for a user with store subscription relation', async () => {
    const subscription = {
      id: 10,
      userId: 167,
      currentStoreSubscriptionId: 901,
      source: SubscriptionSource.GOOGLE_PLAY,
      basePlanId: SubscriptionBasePlanId.LITE_M1,
      billingStatus: SubscriptionBillingStatus.ACTIVE,
      accessStatus: SubscriptionAccessStatus.ACTIVE,
      expiryTime: new Date('2026-07-26T10:00:00.000Z'),
      creditsLimit: 40000,
      usedCredits: 120,
      useWithoutSubscription: false,
      metadata: { accessReason: SubscriptionAccessReason.NONE },
    };
    const storeSubscription = { id: 901 };
    const manager = createManager({
      findOne: (jest
        .fn() as any)
        .mockResolvedValueOnce(subscription)
        .mockResolvedValueOnce(storeSubscription),
    });
    (dataSource.transaction as any).mockImplementationOnce((work: any) =>
      work(manager),
    );

    const result = await service.getCurrentUserSubscription(167);

    expect(result).toEqual({
      subscription: { ...subscription, currentStoreSubscription: storeSubscription },
    });
    expect(manager.findOne).toHaveBeenCalledWith(UserPlanState, {
      where: { userId: 167 },
      lock: { mode: 'pessimistic_write' },
    });
    expect(manager.findOne).toHaveBeenCalledWith(StoreSubscription, {
      where: { id: 901 },
    });
  });

  it('returns null when the user has not been migrated yet', async () => {
    const manager = createManager({
      findOne: (jest.fn() as any).mockResolvedValueOnce(null),
    });
    (dataSource.transaction as any).mockImplementationOnce((work: any) =>
      work(manager),
    );

    await expect(service.getCurrentUserSubscription(167)).resolves.toEqual({
      subscription: null,
    });
  });

  it('refreshes canceled paid subscriptions to limited after their paid period expires', async () => {
    const subscription = {
      id: 10,
      userId: 167,
      source: SubscriptionSource.GOOGLE_PLAY,
      basePlanId: SubscriptionBasePlanId.BASE_M1,
      billingStatus: SubscriptionBillingStatus.CANCELED,
      accessStatus: SubscriptionAccessStatus.ACTIVE,
      expiryTime: new Date('2026-06-27T11:37:44.938Z'),
      creditsLimit: 80000,
      usedCredits: 236,
      useWithoutSubscription: false,
      currentStoreSubscriptionId: 901,
      metadata: { accessReason: SubscriptionAccessReason.NONE },
    };
    const storeSubscription = { id: 901 };
    const manager = createManager({
      findOne: (jest
        .fn() as any)
        .mockResolvedValueOnce(subscription)
        .mockResolvedValueOnce(storeSubscription),
      save: jest.fn(async (_entity: any, payload: any) => payload),
    });
    (dataSource.transaction as any).mockImplementationOnce((work: any) =>
      work(manager),
    );

    const result = await service.refreshEffectiveAccessState(
      167,
      new Date('2026-06-27T11:43:07.715Z'),
    );

    expect(manager.merge).toHaveBeenCalledWith(
      UserPlanState,
      subscription,
      expect.objectContaining({
        accessStatus: SubscriptionAccessStatus.LIMITED,
        metadata: expect.objectContaining({
          accessReason: SubscriptionAccessReason.SUBSCRIPTION_CANCELED,
        }),
      }),
    );
    expect(result).toEqual({
      subscription: expect.objectContaining({
        accessStatus: SubscriptionAccessStatus.LIMITED,
        metadata: expect.objectContaining({
          accessReason: SubscriptionAccessReason.SUBSCRIPTION_CANCELED,
        }),
        currentStoreSubscription: storeSubscription,
      }),
    });
  });

  it('returns current subscription from bootstrap when user is already on V2 runtime', async () => {
    const subscription = {
      id: 10,
      userId: 167,
      basePlanId: SubscriptionBasePlanId.LITE_M1,
    };
    const manager = createManager({
      findOne: (jest
        .fn() as any)
        .mockResolvedValueOnce({
          id: 167,
          subscriptionRuntime: SubscriptionRuntime.V2,
        })
        .mockResolvedValueOnce(subscription),
    });
    (dataSource.transaction as any).mockImplementationOnce((work: any) =>
      work(manager),
    );

    const result = await service.bootstrap(167, { appBuild: 227 });

    expect(result).toEqual({
      subscription,
      runtime: SubscriptionRuntime.V2,
      activated: false,
    });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('syncs legacy plan and activates V2 runtime from bootstrap', async () => {
    const now = new Date('2026-06-26T10:00:00.000Z');
    const user = {
      id: 167,
      usesWithoutSubscription: false,
      subscriptionRuntime: SubscriptionRuntime.LEGACY_COMPAT,
    };
    const legacyPlan = {
      id: 58,
      userId: 167,
      basePlanId: SubscriptionBasePlanId.LITE_M1,
      planStatus: SubscriptionBillingStatus.ACTIVE,
      actual: true,
    };
    const draft = {
      userId: 167,
      source: SubscriptionSource.GOOGLE_PLAY,
      basePlanId: SubscriptionBasePlanId.LITE_M1,
      name: 'Lite',
      price: 394.99,
      currency: 'UAH',
      billingStatus: SubscriptionBillingStatus.ACTIVE,
      accessStatus: SubscriptionAccessStatus.ACTIVE,
      startTime: now,
      expiryTime: new Date('2026-07-26T10:00:00.000Z'),
      creditsLimit: 40000,
      usedCredits: 120,
      inputUsedCredits: 70,
      outputUsedCredits: 50,
      useWithoutSubscription: false,
      currentStoreSubscriptionId: null,
      legacyPlanId: 58,
      metadata: { legacyActual: true },
    };
    (legacyMapper.toStoreSubscriptionDraft as any).mockReturnValueOnce(null);
    (legacyMapper.toUserPlanStateDraft as any).mockReturnValueOnce(draft);
    const manager = createManager({
      findOne: (jest
        .fn() as any)
        .mockResolvedValueOnce(user)
        .mockResolvedValueOnce(legacyPlan)
        .mockResolvedValueOnce(null),
      save: jest.fn(async (_entity: any, payload: any) => payload),
    });
    (dataSource.transaction as any).mockImplementationOnce((work: any) =>
      work(manager),
    );

    const result = await service.bootstrap(
      167,
      { appBuild: 227, appVersion: '2.2.7' },
      now,
    );

    expect(legacyMapper.toUserPlanStateDraft).toHaveBeenCalledWith(
      167,
      legacyPlan,
      {
        now,
        useWithoutSubscription: false,
        currentStoreSubscriptionId: null,
      },
    );
    expect(manager.create).toHaveBeenCalledWith(UserPlanState, draft);
    expect(manager.save).toHaveBeenCalledWith(
      UserPlanState,
      expect.objectContaining({ legacyPlanId: 58 }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      User,
      expect.objectContaining({ subscriptionRuntime: SubscriptionRuntime.V2 }),
    );
    expect(result).toEqual({
      subscription: expect.objectContaining({ legacyPlanId: 58 }),
      runtime: SubscriptionRuntime.V2,
      activated: true,
    });
  });

  it('returns existing subscription state from initial ensure without creating a new trial', async () => {
    const existing = {
      id: 10,
      userId: 167,
      basePlanId: SubscriptionBasePlanId.LITE_M1,
    };
    const manager = createManager({
      findOne: (jest
        .fn() as any)
        .mockResolvedValueOnce({ id: 167 })
        .mockResolvedValueOnce(existing),
    });
    (dataSource.transaction as any).mockImplementationOnce((work: any) =>
      work(manager),
    );

    const result = await service.ensureInitialState(167);

    expect(result).toEqual({ subscription: existing, created: false });
    expect(manager.create).not.toHaveBeenCalled();
    expect(manager.save).toHaveBeenCalledWith(
      User,
      expect.objectContaining({ subscriptionRuntime: SubscriptionRuntime.V2 }),
    );
  });

  it('creates a start trial from initial ensure when subscription state is missing', async () => {
    const now = new Date('2026-06-26T10:00:00.000Z');
    const manager = createManager({
      findOne: (jest
        .fn() as any)
        .mockResolvedValueOnce({ id: 167 })
        .mockResolvedValueOnce(null),
    });
    (dataSource.transaction as any).mockImplementationOnce((work: any) =>
      work(manager),
    );

    const result = await service.ensureInitialState(167, {}, now);

    expect(result).toEqual({
      subscription: expect.objectContaining({
        userId: 167,
        source: SubscriptionSource.TRIAL,
        basePlanId: SubscriptionBasePlanId.START,
        billingStatus: SubscriptionBillingStatus.NONE,
        accessStatus: SubscriptionAccessStatus.ACTIVE,
        creditsLimit: 5000,
        metadata: expect.objectContaining({
          accessReason: SubscriptionAccessReason.NONE,
          trialUsed: true,
          trialStartedAt: '2026-06-26T10:00:00.000Z',
          trialExpiryTime: '2026-07-03T10:00:00.000Z',
        }),
      }),
      created: true,
    });
    expect(manager.create).toHaveBeenCalledWith(
      UserPlanState,
      expect.objectContaining({
        basePlanId: SubscriptionBasePlanId.START,
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      User,
      expect.objectContaining({ subscriptionRuntime: SubscriptionRuntime.V2 }),
    );
  });

  it('creates a no-plan selection state from initial ensure for returning installs', async () => {
    const now = new Date('2026-06-26T10:00:00.000Z');
    const manager = createManager({
      findOne: (jest
        .fn() as any)
        .mockResolvedValueOnce({ id: 167 })
        .mockResolvedValueOnce(null),
    });
    (dataSource.transaction as any).mockImplementationOnce((work: any) =>
      work(manager),
    );

    const result = await service.ensureInitialState(
      167,
      { isFirstInstall: false },
      now,
    );

    expect(result).toEqual({
      subscription: expect.objectContaining({
        userId: 167,
        source: SubscriptionSource.NONE,
        basePlanId: null,
        billingStatus: SubscriptionBillingStatus.NONE,
        accessStatus: SubscriptionAccessStatus.LIMITED,
        creditsLimit: 0,
        useWithoutSubscription: false,
        metadata: expect.objectContaining({
          accessReason: SubscriptionAccessReason.PLAN_SELECTION_REQUIRED,
        }),
      }),
      created: true,
    });
    expect(manager.create).toHaveBeenCalledWith(
      UserPlanState,
      expect.objectContaining({
        source: SubscriptionSource.NONE,
        basePlanId: null,
        useWithoutSubscription: false,
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      User,
      expect.objectContaining({ subscriptionRuntime: SubscriptionRuntime.V2 }),
    );
  });

  it('starts a new trial subscription state for a user without subscription state', async () => {
    const now = new Date('2026-06-26T10:00:00.000Z');
    const manager = createManager({
      findOne: (jest
        .fn() as any)
        .mockResolvedValueOnce({ id: 167 })
        .mockResolvedValueOnce(null),
    });
    (dataSource.transaction as any).mockImplementationOnce((work: any) =>
      work(manager),
    );

    const result = await service.startTrial(167, now);

    expect(result.subscription).toEqual(
      expect.objectContaining({
        userId: 167,
        source: SubscriptionSource.TRIAL,
        basePlanId: SubscriptionBasePlanId.START,
        name: 'Start',
        price: 0,
        currency: null,
        billingStatus: SubscriptionBillingStatus.NONE,
        accessStatus: SubscriptionAccessStatus.ACTIVE,
        creditsLimit: 5000,
        usedCredits: 0,
        inputUsedCredits: 0,
        outputUsedCredits: 0,
        useWithoutSubscription: false,
        currentStoreSubscriptionId: null,
        metadata: expect.objectContaining({
          accessReason: SubscriptionAccessReason.NONE,
          trialUsed: true,
          trialStartedAt: '2026-06-26T10:00:00.000Z',
          trialExpiryTime: '2026-07-03T10:00:00.000Z',
        }),
      }),
    );
    expect(manager.findOne).toHaveBeenCalledWith(User, {
      where: { id: 167 },
      lock: { mode: 'pessimistic_write' },
    });
    expect(manager.findOne).toHaveBeenCalledWith(UserPlanState, {
      where: { userId: 167 },
      lock: { mode: 'pessimistic_write' },
    });
    expect(manager.create).toHaveBeenCalledWith(
      UserPlanState,
      expect.objectContaining({
        basePlanId: SubscriptionBasePlanId.START,
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      User,
      expect.objectContaining({ subscriptionRuntime: SubscriptionRuntime.V2 }),
    );
  });

  it('turns an unused no-plan state into a trial state', async () => {
    const now = new Date('2026-06-26T10:00:00.000Z');
    const existing = {
      id: 10,
      userId: 167,
      basePlanId: null,
      metadata: { legacyReason: 'NO_PLAN' },
      legacyPlanId: null,
    };
    const manager = createManager({
      findOne: (jest
        .fn() as any)
        .mockResolvedValueOnce({ id: 167 })
        .mockResolvedValueOnce(existing),
    });
    (dataSource.transaction as any).mockImplementationOnce((work: any) =>
      work(manager),
    );

    const result = await service.startTrial(167, now);

    expect(result.subscription).toEqual(
      expect.objectContaining({
        id: 10,
        basePlanId: SubscriptionBasePlanId.START,
        metadata: expect.objectContaining({
          accessReason: SubscriptionAccessReason.NONE,
          legacyReason: 'NO_PLAN',
          trialUsed: true,
        }),
      }),
    );
    expect(manager.merge).toHaveBeenCalledWith(
      UserPlanState,
      existing,
      expect.objectContaining({
        basePlanId: SubscriptionBasePlanId.START,
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      User,
      expect.objectContaining({ subscriptionRuntime: SubscriptionRuntime.V2 }),
    );
  });

  it('rejects a repeated trial when the user already has subscription history', async () => {
    const manager = createManager({
      findOne: (jest
        .fn() as any)
        .mockResolvedValueOnce({ id: 167 })
        .mockResolvedValueOnce({
          id: 10,
          userId: 167,
          basePlanId: SubscriptionBasePlanId.START,
          metadata: { trialUsed: true },
        }),
    });
    (dataSource.transaction as any).mockImplementationOnce((work: any) =>
      work(manager),
    );

    await expect(service.startTrial(167)).rejects.toThrow();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('moves a credit-exceeded trial state to use-without-subscription', async () => {
    const existing = {
      id: 10,
      userId: 167,
      source: SubscriptionSource.TRIAL,
      basePlanId: SubscriptionBasePlanId.START,
      name: 'Start',
      price: 0,
      currency: null,
      billingStatus: SubscriptionBillingStatus.NONE,
      accessStatus: SubscriptionAccessStatus.ACTIVE,
      startTime: new Date('2026-06-26T10:00:00.000Z'),
      expiryTime: new Date('2026-07-26T10:00:00.000Z'),
      creditsLimit: 5000,
      usedCredits: 5000,
      inputUsedCredits: 3000,
      outputUsedCredits: 2000,
      useWithoutSubscription: false,
      currentStoreSubscriptionId: null,
      legacyPlanId: null,
      metadata: { accessReason: SubscriptionAccessReason.CREDIT_EXCEEDED },
    };
    const manager = createManager({
      findOne: (jest
        .fn() as any)
        .mockResolvedValueOnce({ id: 167 })
        .mockResolvedValueOnce(existing),
      save: jest.fn(async (_entity: any, payload: any) => payload),
    });
    (dataSource.transaction as any).mockImplementationOnce((work: any) =>
      work(manager),
    );

    const result = await service.useWithoutSubscription(167);

    expect(manager.merge).toHaveBeenCalledWith(
      UserPlanState,
      existing,
      expect.objectContaining({
        source: SubscriptionSource.NONE,
        basePlanId: null,
        name: 'None',
        price: 0,
        currency: null,
        billingStatus: SubscriptionBillingStatus.NONE,
        accessStatus: SubscriptionAccessStatus.LIMITED,
        useWithoutSubscription: true,
        currentStoreSubscriptionId: null,
        metadata: expect.objectContaining({
          accessReason: SubscriptionAccessReason.USE_WITHOUT_SUBSCRIPTION,
        }),
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      UserPlanState,
      expect.objectContaining({
        useWithoutSubscription: true,
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      User,
      expect.objectContaining({ subscriptionRuntime: SubscriptionRuntime.V2 }),
    );
    expect(result.subscription).toEqual(
      expect.objectContaining({
        accessStatus: SubscriptionAccessStatus.LIMITED,
        useWithoutSubscription: true,
        currentStoreSubscriptionId: null,
      }),
    );
  });

  it('rejects use-without-subscription for active paid credit-exceeded period', async () => {
    const existing = {
      id: 10,
      userId: 167,
      source: SubscriptionSource.GOOGLE_PLAY,
      basePlanId: SubscriptionBasePlanId.LITE_M1,
      name: 'Lite',
      price: 394.99,
      currency: 'UAH',
      billingStatus: SubscriptionBillingStatus.ACTIVE,
      accessStatus: SubscriptionAccessStatus.LIMITED,
      startTime: new Date('2026-06-26T10:00:00.000Z'),
      expiryTime: new Date('2026-07-26T10:00:00.000Z'),
      creditsLimit: 40000,
      usedCredits: 40000,
      inputUsedCredits: 20000,
      outputUsedCredits: 20000,
      useWithoutSubscription: false,
      currentStoreSubscriptionId: 901,
      legacyPlanId: null,
      metadata: { accessReason: SubscriptionAccessReason.CREDIT_EXCEEDED },
    };
    const manager = createManager({
      findOne: (jest
        .fn() as any)
        .mockResolvedValueOnce({ id: 167 })
        .mockResolvedValueOnce(existing),
      save: jest.fn(async (_entity: any, payload: any) => payload),
    });
    (dataSource.transaction as any).mockImplementationOnce((work: any) =>
      work(manager),
    );

    await expect(service.useWithoutSubscription(167)).rejects.toThrow();

    expect(manager.merge).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects use-without-subscription when initial state has not been ensured', async () => {
    const manager = createManager({
      findOne: (jest
        .fn() as any)
        .mockResolvedValueOnce({ id: 167 })
        .mockResolvedValueOnce(null),
      save: jest.fn(async (_entity: any, payload: any) => payload),
    });
    (dataSource.transaction as any).mockImplementationOnce((work: any) =>
      work(manager),
    );

    await expect(service.useWithoutSubscription(167)).rejects.toThrow();

    expect(manager.create).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('creates Google Play store subscription and updates current user plan state', async () => {
    (googlePlaySubscriptionsService.verifyAndroidSubscription as any)
      .mockResolvedValueOnce(verifiedGooglePlaySubscription());
    const existingState = {
      id: 10,
      userId: 167,
      source: SubscriptionSource.TRIAL,
      basePlanId: SubscriptionBasePlanId.START,
      billingStatus: SubscriptionBillingStatus.NONE,
      accessStatus: SubscriptionAccessStatus.ACTIVE,
      currentStoreSubscriptionId: null,
      usedCredits: 120,
      inputUsedCredits: 70,
      outputUsedCredits: 50,
      metadata: { trialUsed: true },
      legacyPlanId: null,
    };
    const manager = createManager({
      findOne: (jest
        .fn() as any)
        .mockResolvedValueOnce({ id: 167 })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingState),
      create: jest.fn((_entity: any, payload: any) => ({
        id: _entity === StoreSubscription ? 901 : 10,
        ...payload,
      })),
      save: jest.fn(async (_entity: any, payload: any) => payload),
    });
    (dataSource.transaction as any).mockImplementationOnce((work: any) =>
      work(manager),
    );

    const result = await service.subscribeGooglePlay(167, {
      packageName: 'app.package',
      purchaseToken: 'purchase-token',
    });

    expect(
      googlePlaySubscriptionsService.verifyAndroidSubscription,
    ).toHaveBeenCalledWith('app.package', 'purchase-token');
    expect(manager.create).toHaveBeenCalledWith(
      StoreSubscription,
      expect.objectContaining({
        userId: 167,
        provider: StoreSubscriptionProvider.GOOGLE_PLAY,
        purchaseToken: 'purchase-token',
        basePlanId: SubscriptionBasePlanId.LITE_M1,
        lastOrderId: 'GPA.new',
      }),
    );
    expect(manager.merge).toHaveBeenCalledWith(
      UserPlanState,
      existingState,
      expect.objectContaining({
        source: SubscriptionSource.GOOGLE_PLAY,
        basePlanId: SubscriptionBasePlanId.LITE_M1,
        billingStatus: SubscriptionBillingStatus.ACTIVE,
        accessStatus: SubscriptionAccessStatus.ACTIVE,
        currentStoreSubscriptionId: 901,
        creditsLimit: 40000,
        usedCredits: 0,
        inputUsedCredits: 0,
        outputUsedCredits: 0,
        useWithoutSubscription: false,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        subscription: expect.objectContaining({
          currentStoreSubscriptionId: 901,
          currentStoreSubscription: expect.objectContaining({
            id: 901,
            purchaseToken: 'purchase-token',
          }),
        }),
        storeSubscription: expect.objectContaining({
          id: 901,
          purchaseToken: 'purchase-token',
        }),
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      User,
      expect.objectContaining({ subscriptionRuntime: SubscriptionRuntime.V2 }),
    );
    expect(paidPlanEventsService.info).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'SUBSCRIPTIONS_GOOGLE_PLAY_SUBSCRIBED',
        userId: 167,
        purchaseToken: 'purchase-token',
        orderId: 'GPA.new',
      }),
    );
  });

  it('rejects Google Play tokens with a different obfuscated account id', async () => {
    (googlePlaySubscriptionsService.verifyAndroidSubscription as any)
      .mockResolvedValueOnce(
        verifiedGooglePlaySubscription({
          googleData: {
            externalAccountIdentifiers: {
              obfuscatedExternalAccountId: 'another-user-uuid',
            },
          },
        }),
      );
    const manager = createManager({
      findOne: (jest.fn() as any).mockResolvedValueOnce({
        id: 167,
        uuid: 'current-user-uuid',
      }),
    });
    (dataSource.transaction as any).mockImplementationOnce((work: any) =>
      work(manager),
    );

    await expect(
      service.subscribeGooglePlay(167, {
        packageName: 'app.package',
        purchaseToken: 'purchase-token',
        obfuscatedAccountId: 'current-user-uuid',
      }),
    ).rejects.toThrow();

    expect(manager.findOne).toHaveBeenCalledTimes(1);
    expect(manager.create).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
    expect(paidPlanEventsService.conflict).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'SUBSCRIPTIONS_GOOGLE_PLAY_OBFUSCATED_ACCOUNT_MISMATCH',
        userId: 167,
        purchaseToken: 'purchase-token',
        metadata: expect.objectContaining({
          clientObfuscatedAccountId: 'current-user-uuid',
          googleObfuscatedAccountId: 'another-user-uuid',
          userUuid: 'current-user-uuid',
        }),
      }),
    );
  });

  it('rejects active Google Play tokens already linked to another user', async () => {
    (googlePlaySubscriptionsService.verifyAndroidSubscription as any)
      .mockResolvedValueOnce(verifiedGooglePlaySubscription());
    const manager = createManager({
      findOne: (jest
        .fn() as any)
        .mockResolvedValueOnce({ id: 167 })
        .mockResolvedValueOnce({
          id: 901,
          userId: 999,
          purchaseToken: 'purchase-token',
          lastOrderId: 'GPA.old',
          basePlanId: SubscriptionBasePlanId.LITE_M1,
          storeStatus: SubscriptionBillingStatus.ACTIVE,
          expiryTime: new Date('2026-07-20T10:00:00.000Z'),
          legacyPlanId: null,
        }),
    });
    (dataSource.transaction as any).mockImplementationOnce((work: any) =>
      work(manager),
    );

    await expect(
      service.subscribeGooglePlay(167, {
        packageName: 'app.package',
        purchaseToken: 'purchase-token',
      }),
    ).rejects.toThrow();

    expect(manager.save).not.toHaveBeenCalled();
    expect(paidPlanEventsService.conflict).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'SUBSCRIPTIONS_GOOGLE_PLAY_TOKEN_ALREADY_LINKED',
        userId: 167,
        purchaseToken: 'purchase-token',
        metadata: expect.objectContaining({
          existingUserId: 999,
          requestedUserId: 167,
        }),
      }),
    );
  });

  it('ignores Pub/Sub tokens missing from store subscriptions when Google has no obfuscated account id', async () => {
    (storeSubscriptionsRepository.findOne as any).mockResolvedValueOnce(null);
    (googlePlaySubscriptionsService.verifyAndroidSubscription as any)
      .mockResolvedValueOnce(verifiedGooglePlaySubscription());

    const result = await service.handleGooglePlayPubSub(
      'app.package',
      'missing-token',
      2,
    );

    expect(result).toEqual({
      handled: false,
      reason: 'STORE_SUBSCRIPTION_NOT_FOUND',
    });
    expect(
      googlePlaySubscriptionsService.verifyAndroidSubscription,
    ).toHaveBeenCalledWith('app.package', 'missing-token');
    expect(paidPlanEventsService.info).not.toHaveBeenCalled();
    expect(paidPlanEventsService.conflict).not.toHaveBeenCalled();
  });

  it('recovers a missing Pub/Sub store subscription using Google obfuscated account id', async () => {
    (storeSubscriptionsRepository.findOne as any).mockResolvedValueOnce(null);
    (googlePlaySubscriptionsService.verifyAndroidSubscription as any)
      .mockResolvedValueOnce(
        verifiedGooglePlaySubscription({
          googleData: {
            externalAccountIdentifiers: {
              obfuscatedExternalAccountId: 'user-uuid',
            },
          },
        }),
      );
    const user = {
      id: 167,
      uuid: 'user-uuid',
      subscriptionRuntime: SubscriptionRuntime.V2,
    };
    const manager = createManager({
      findOne: (jest
        .fn() as any)
        .mockResolvedValueOnce(user)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null),
      save: jest.fn(async (_entity: any, payload: any) => payload),
    });
    (dataSource.transaction as any).mockImplementationOnce((work: any) =>
      work(manager),
    );

    const result = await service.handleGooglePlayPubSub(
      'app.package',
      'purchase-token',
      4,
    );

    expect(manager.findOne).toHaveBeenCalledWith(User, {
      where: { uuid: 'user-uuid' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(manager.create).toHaveBeenCalledWith(
      StoreSubscription,
      expect.objectContaining({
        userId: 167,
        provider: StoreSubscriptionProvider.GOOGLE_PLAY,
        purchaseToken: 'purchase-token',
        lastOrderId: 'GPA.new',
      }),
    );
    expect(manager.create).toHaveBeenCalledWith(
      UserPlanState,
      expect.objectContaining({
        userId: 167,
        source: SubscriptionSource.GOOGLE_PLAY,
        billingStatus: SubscriptionBillingStatus.ACTIVE,
        accessStatus: SubscriptionAccessStatus.ACTIVE,
        currentStoreSubscriptionId: 10,
        metadata: expect.objectContaining({
          notificationType: 4,
          googleSubscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
          accessReason: SubscriptionAccessReason.NONE,
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        handled: true,
        recovered: true,
        subscription: expect.objectContaining({
          userId: 167,
          currentStoreSubscriptionId: 10,
        }),
        storeSubscription: expect.objectContaining({
          userId: 167,
          purchaseToken: 'purchase-token',
        }),
      }),
    );
    expect(paidPlanEventsService.info).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'SUBSCRIPTIONS_PUBSUB_RECOVERED_FROM_OBFUSCATED_ACCOUNT',
        source: expect.any(String),
        userId: 167,
        purchaseToken: 'purchase-token',
        orderId: 'GPA.new',
      }),
    );
  });

  it('updates store subscription and user plan state from Pub/Sub', async () => {
    (storeSubscriptionsRepository.findOne as any).mockResolvedValueOnce({
      id: 901,
      userId: 167,
      purchaseToken: 'purchase-token',
    });
    (googlePlaySubscriptionsService.verifyAndroidSubscription as any)
      .mockResolvedValueOnce(verifiedGooglePlaySubscription());
    const existingStoreSubscription = {
      id: 901,
      userId: 167,
      purchaseToken: 'purchase-token',
      lastOrderId: 'GPA.old',
      basePlanId: SubscriptionBasePlanId.LITE_M1,
      storeStatus: SubscriptionBillingStatus.ACTIVE,
      expiryTime: new Date('2026-07-20T10:00:00.000Z'),
      legacyPlanId: null,
    };
    const existingState = {
      id: 10,
      userId: 167,
      source: SubscriptionSource.GOOGLE_PLAY,
      basePlanId: SubscriptionBasePlanId.LITE_M1,
      billingStatus: SubscriptionBillingStatus.ACTIVE,
      accessStatus: SubscriptionAccessStatus.LIMITED,
      currentStoreSubscriptionId: 901,
      usedCredits: 40000,
      inputUsedCredits: 20000,
      outputUsedCredits: 20000,
      useWithoutSubscription: true,
      metadata: { trialUsed: true },
      legacyPlanId: null,
    };
    const manager = createManager({
      findOne: (jest
        .fn() as any)
        .mockResolvedValueOnce(existingStoreSubscription)
        .mockResolvedValueOnce(existingState),
      save: jest.fn(async (_entity: any, payload: any) => payload),
    });
    (dataSource.transaction as any).mockImplementationOnce((work: any) =>
      work(manager),
    );

    const result = await service.handleGooglePlayPubSub(
      'app.package',
      'purchase-token',
      2,
    );

    expect(
      googlePlaySubscriptionsService.verifyAndroidSubscription,
    ).toHaveBeenCalledWith('app.package', 'purchase-token');
    expect(manager.merge).toHaveBeenCalledWith(
      StoreSubscription,
      existingStoreSubscription,
      expect.objectContaining({
        lastOrderId: 'GPA.new',
        storeStatus: SubscriptionBillingStatus.ACTIVE,
        rawStoreData: expect.objectContaining({
          subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        }),
      }),
    );
    expect(manager.merge).toHaveBeenCalledWith(
      UserPlanState,
      existingState,
      expect.objectContaining({
        billingStatus: SubscriptionBillingStatus.ACTIVE,
        accessStatus: SubscriptionAccessStatus.ACTIVE,
        usedCredits: 0,
        inputUsedCredits: 0,
        outputUsedCredits: 0,
        useWithoutSubscription: false,
        currentStoreSubscriptionId: 901,
        metadata: expect.objectContaining({
          accessReason: SubscriptionAccessReason.NONE,
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        handled: true,
        subscription: expect.objectContaining({
          currentStoreSubscriptionId: 901,
          currentStoreSubscription: expect.objectContaining({
            id: 901,
            purchaseToken: 'purchase-token',
          }),
        }),
        storeSubscription: expect.objectContaining({
          id: 901,
          purchaseToken: 'purchase-token',
        }),
      }),
    );
    expect(paidPlanEventsService.info).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'SUBSCRIPTIONS_PUBSUB_UPDATED',
        source: expect.any(String),
        userId: 167,
        purchaseToken: 'purchase-token',
        orderId: 'GPA.new',
        oldOrderId: 'GPA.old',
      }),
    );
  });

  it('keeps access active for a scheduled pause notification while Google still returns ACTIVE', async () => {
    (storeSubscriptionsRepository.findOne as any).mockResolvedValueOnce({
      id: 901,
      userId: 167,
      purchaseToken: 'purchase-token',
    });
    (googlePlaySubscriptionsService.verifyAndroidSubscription as any)
      .mockResolvedValueOnce(
        verifiedGooglePlaySubscription({
          storeData: {
            storeStatus: SubscriptionBillingStatus.ACTIVE,
            lastOrderId: 'GPA.same',
            expiryTime: new Date('2026-07-26T10:00:00.000Z'),
          },
          googleData: {
            subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
          },
        }),
      );

    const existingStoreSubscription = {
      id: 901,
      userId: 167,
      purchaseToken: 'purchase-token',
      lastOrderId: 'GPA.same',
      basePlanId: SubscriptionBasePlanId.LITE_M1,
      storeStatus: SubscriptionBillingStatus.ACTIVE,
      expiryTime: new Date('2026-07-20T10:00:00.000Z'),
      legacyPlanId: null,
    };
    const existingState = {
      id: 10,
      userId: 167,
      source: SubscriptionSource.GOOGLE_PLAY,
      basePlanId: SubscriptionBasePlanId.LITE_M1,
      billingStatus: SubscriptionBillingStatus.ACTIVE,
      accessStatus: SubscriptionAccessStatus.ACTIVE,
      currentStoreSubscriptionId: 901,
      usedCredits: 100,
      inputUsedCredits: 40,
      outputUsedCredits: 60,
      useWithoutSubscription: false,
      metadata: { trialUsed: true },
      legacyPlanId: null,
    };
    const manager = createManager({
      findOne: (jest
        .fn() as any)
        .mockResolvedValueOnce(existingStoreSubscription)
        .mockResolvedValueOnce(existingState),
      save: jest.fn(async (_entity: any, payload: any) => payload),
    });
    (dataSource.transaction as any).mockImplementationOnce((work: any) =>
      work(manager),
    );

    await service.handleGooglePlayPubSub('app.package', 'purchase-token', 11);

    expect(manager.merge).toHaveBeenCalledWith(
      UserPlanState,
      existingState,
      expect.objectContaining({
        billingStatus: SubscriptionBillingStatus.ACTIVE,
        accessStatus: SubscriptionAccessStatus.ACTIVE,
        usedCredits: 100,
        inputUsedCredits: 40,
        outputUsedCredits: 60,
        metadata: expect.objectContaining({
          accessReason: SubscriptionAccessReason.NONE,
          notificationType: 11,
          googleSubscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        }),
      }),
    );
  });

  it('limits access when Google Pub/Sub verifies the subscription as paused', async () => {
    (storeSubscriptionsRepository.findOne as any).mockResolvedValueOnce({
      id: 901,
      userId: 167,
      purchaseToken: 'purchase-token',
    });
    (googlePlaySubscriptionsService.verifyAndroidSubscription as any)
      .mockResolvedValueOnce(
        verifiedGooglePlaySubscription({
          storeData: {
            storeStatus: SubscriptionBillingStatus.PAUSED,
            lastOrderId: 'GPA.same',
            expiryTime: new Date('2026-07-26T10:00:00.000Z'),
          },
          googleData: {
            subscriptionState: 'SUBSCRIPTION_STATE_PAUSED',
          },
        }),
      );

    const existingStoreSubscription = {
      id: 901,
      userId: 167,
      purchaseToken: 'purchase-token',
      lastOrderId: 'GPA.same',
      basePlanId: SubscriptionBasePlanId.LITE_M1,
      storeStatus: SubscriptionBillingStatus.ACTIVE,
      expiryTime: new Date('2026-07-20T10:00:00.000Z'),
      legacyPlanId: null,
    };
    const existingState = {
      id: 10,
      userId: 167,
      source: SubscriptionSource.GOOGLE_PLAY,
      basePlanId: SubscriptionBasePlanId.LITE_M1,
      billingStatus: SubscriptionBillingStatus.ACTIVE,
      accessStatus: SubscriptionAccessStatus.ACTIVE,
      currentStoreSubscriptionId: 901,
      usedCredits: 100,
      inputUsedCredits: 40,
      outputUsedCredits: 60,
      useWithoutSubscription: false,
      metadata: { trialUsed: true },
      legacyPlanId: null,
    };
    const manager = createManager({
      findOne: (jest
        .fn() as any)
        .mockResolvedValueOnce(existingStoreSubscription)
        .mockResolvedValueOnce(existingState),
      save: jest.fn(async (_entity: any, payload: any) => payload),
    });
    (dataSource.transaction as any).mockImplementationOnce((work: any) =>
      work(manager),
    );

    await service.handleGooglePlayPubSub('app.package', 'purchase-token', 10);

    expect(manager.merge).toHaveBeenCalledWith(
      UserPlanState,
      existingState,
      expect.objectContaining({
        billingStatus: SubscriptionBillingStatus.PAUSED,
        accessStatus: SubscriptionAccessStatus.LIMITED,
        usedCredits: 100,
        inputUsedCredits: 40,
        outputUsedCredits: 60,
        metadata: expect.objectContaining({
          accessReason: SubscriptionAccessReason.BILLING_PAUSED,
          notificationType: 10,
          googleSubscriptionState: 'SUBSCRIPTION_STATE_PAUSED',
        }),
      }),
    );
  });

  it('keeps canceled Google Play subscriptions active until expiry and limits them after Google expires them', async () => {
    const existingState = {
      id: 10,
      userId: 167,
      source: SubscriptionSource.GOOGLE_PLAY,
      basePlanId: SubscriptionBasePlanId.LITE_M1,
      billingStatus: SubscriptionBillingStatus.ACTIVE,
      accessStatus: SubscriptionAccessStatus.ACTIVE,
      currentStoreSubscriptionId: 901,
      usedCredits: 100,
      inputUsedCredits: 40,
      outputUsedCredits: 60,
      useWithoutSubscription: false,
      metadata: { trialUsed: true },
      legacyPlanId: null,
    };

    (storeSubscriptionsRepository.findOne as any)
      .mockResolvedValueOnce({
        id: 901,
        userId: 167,
        purchaseToken: 'purchase-token',
      })
      .mockResolvedValueOnce({
        id: 901,
        userId: 167,
        purchaseToken: 'purchase-token',
      });
    (googlePlaySubscriptionsService.verifyAndroidSubscription as any)
      .mockResolvedValueOnce(
        verifiedGooglePlaySubscription({
          storeData: {
            storeStatus: SubscriptionBillingStatus.CANCELED,
            lastOrderId: 'GPA.same',
            expiryTime: new Date('2026-07-26T10:00:00.000Z'),
          },
          googleData: {
            subscriptionState: 'SUBSCRIPTION_STATE_CANCELED',
          },
        }),
      )
      .mockResolvedValueOnce(
        verifiedGooglePlaySubscription({
          storeData: {
            storeStatus: SubscriptionBillingStatus.EXPIRED,
            lastOrderId: 'GPA.same',
            expiryTime: new Date('2026-07-26T10:00:00.000Z'),
          },
          googleData: {
            subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED',
          },
        }),
      );

    const canceledStoreSubscription = {
      id: 901,
      userId: 167,
      purchaseToken: 'purchase-token',
      lastOrderId: 'GPA.same',
      basePlanId: SubscriptionBasePlanId.LITE_M1,
      storeStatus: SubscriptionBillingStatus.ACTIVE,
      expiryTime: new Date('2026-07-20T10:00:00.000Z'),
      legacyPlanId: null,
    };
    const expiredStoreSubscription = {
      ...canceledStoreSubscription,
      storeStatus: SubscriptionBillingStatus.CANCELED,
      expiryTime: new Date('2026-07-26T10:00:00.000Z'),
    };
    const canceledManager = createManager({
      findOne: (jest
        .fn() as any)
        .mockResolvedValueOnce(canceledStoreSubscription)
        .mockResolvedValueOnce(existingState),
      save: jest.fn(async (_entity: any, payload: any) => payload),
    });
    const expiredManager = createManager({
      findOne: (jest
        .fn() as any)
        .mockResolvedValueOnce(expiredStoreSubscription)
        .mockResolvedValueOnce({
          ...existingState,
          billingStatus: SubscriptionBillingStatus.CANCELED,
          accessStatus: SubscriptionAccessStatus.ACTIVE,
        }),
      save: jest.fn(async (_entity: any, payload: any) => payload),
    });
    (dataSource.transaction as any)
      .mockImplementationOnce((work: any) => work(canceledManager))
      .mockImplementationOnce((work: any) => work(expiredManager));

    await service.handleGooglePlayPubSub('app.package', 'purchase-token', 3);
    await service.handleGooglePlayPubSub('app.package', 'purchase-token', 13);

    expect(canceledManager.merge).toHaveBeenCalledWith(
      UserPlanState,
      existingState,
      expect.objectContaining({
        billingStatus: SubscriptionBillingStatus.CANCELED,
        accessStatus: SubscriptionAccessStatus.ACTIVE,
        metadata: expect.objectContaining({
          accessReason: SubscriptionAccessReason.NONE,
        }),
      }),
    );
    expect(expiredManager.merge).toHaveBeenCalledWith(
      UserPlanState,
      expect.any(Object),
      expect.objectContaining({
        billingStatus: SubscriptionBillingStatus.EXPIRED,
        accessStatus: SubscriptionAccessStatus.LIMITED,
        metadata: expect.objectContaining({
          accessReason: SubscriptionAccessReason.SUBSCRIPTION_EXPIRED,
        }),
      }),
    );
  });
});
