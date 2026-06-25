import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PlansService } from './plans.service';
import { BasePlanIds, PlanStatus, SubscriptionIds } from './types';
import { Platform } from 'src/common/types/platform';
import { AiModel } from 'src/users/types';

describe('PlansService', () => {
  const planRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    merge: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(),
  };
  const usersService = {};
  const paidPlanEventsService = {
    info: jest.fn(),
    warning: jest.fn(),
    conflict: jest.fn(),
  };

  let service: PlansService;
  let consoleLogSpy: jest.SpiedFunction<typeof console.log>;
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

  const user = { id: 167 };
  const paidPlanDto = {
    platform: Platform.ANDROID,
    regionCode: 'UA',
    subscriptionId: SubscriptionIds.NEMORY,
    basePlanId: BasePlanIds.BASE_M1,
    price: 394.99,
    currency: 'UAH',
    purchaseToken: 'new-token',
    linkedPurchaseToken: 'old-token',
    startTime: new Date('2026-06-25T15:00:00.000Z'),
    expiryTime: new Date('2026-07-25T15:00:00.000Z'),
    startPayment: null,
    autoRenewEnabled: true,
    planStatus: PlanStatus.ACTIVE,
    actual: true,
    lastOrderId: 'GPA.new',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    service = new PlansService(
      planRepository as any,
      dataSource as any,
      usersService as any,
      paidPlanEventsService as any,
    );
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  function createManager(overrides: Partial<Record<string, jest.Mock>> = {}) {
    return {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((_entity: any, payload: any) => ({
        id: 59,
        ...payload,
      })),
      merge: jest.fn((_entity: any, target: any, payload: any) =>
        Object.assign(target, payload),
      ),
      save: jest.fn(async (_entity: any, payload: any) => payload),
      update: jest.fn(),
      ...overrides,
    } as any;
  }

  it('creates a paid plan, switches off previous paid actual plan, and logs both events', async () => {
    const oldPaidPlan = {
      id: 58,
      userId: 167,
      basePlanId: BasePlanIds.LITE_M1,
      planStatus: PlanStatus.ACTIVE,
      actual: true,
      lastOrderId: 'GPA.old',
      expiryTime: new Date('2026-07-20T15:00:00.000Z'),
    };
    const manager = createManager();
    manager.findOne.mockResolvedValueOnce(user).mockResolvedValueOnce(null);
    manager.find.mockResolvedValueOnce([oldPaidPlan]).mockResolvedValueOnce([
      oldPaidPlan,
    ]);
    (dataSource.transaction as any).mockImplementation(async (callback: any) =>
      callback(manager),
    );

    const result = await service.subscribePlan(167, paidPlanDto as any);

    expect(result.plan.id).toBe(59);
    expect(manager.update).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        user: { id: 167 },
        actual: true,
        id: expect.anything(),
      }),
      { actual: false },
    );
    expect(paidPlanEventsService.info).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PAID_PLAN_CREATED',
        userId: 167,
        planId: 59,
        purchaseToken: 'new-token',
      }),
    );
    expect(paidPlanEventsService.warning).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PAID_PLAN_ACTUAL_SWITCH',
        userId: 167,
        oldPlanId: 58,
        newPlanId: 59,
      }),
    );
  });

  it('does not emit paid-plan logs for the free trial plan', async () => {
    const manager = createManager();
    manager.findOne.mockResolvedValueOnce(user).mockResolvedValueOnce(null);
    manager.find.mockResolvedValueOnce([]);
    (dataSource.transaction as any).mockImplementation(async (callback: any) =>
      callback(manager),
    );

    await service.subscribePlan(167, {
      ...paidPlanDto,
      basePlanId: BasePlanIds.START,
      price: 0,
      purchaseToken: null,
      linkedPurchaseToken: null,
      lastOrderId: null,
    } as any);

    expect(paidPlanEventsService.info).not.toHaveBeenCalled();
    expect(paidPlanEventsService.warning).not.toHaveBeenCalled();
    expect(paidPlanEventsService.conflict).not.toHaveBeenCalled();
  });

  it('rejects creating a second start plan for the same user', async () => {
    const existingStartPlan = {
      id: 1,
      userId: 167,
      basePlanId: BasePlanIds.START,
    };
    const manager = createManager();
    manager.findOne.mockResolvedValueOnce(user).mockResolvedValueOnce(null);
    manager.find.mockResolvedValueOnce([existingStartPlan]);
    (dataSource.transaction as any).mockImplementation(async (callback: any) =>
      callback(manager),
    );

    await expect(
      service.subscribePlan(167, {
        ...paidPlanDto,
        basePlanId: BasePlanIds.START,
        price: 0,
        purchaseToken: null,
        linkedPurchaseToken: null,
        lastOrderId: null,
      } as any),
    ).rejects.toThrow('You have already used your free trial.');

    expect(manager.create).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('updates an existing purchase token and resets credits for a new order cycle', async () => {
    const existingPlan = {
      id: 58,
      userId: 167,
      basePlanId: BasePlanIds.LITE_M1,
      planStatus: PlanStatus.ACTIVE,
      actual: true,
      lastOrderId: 'GPA.old',
      usedCredits: 120,
      inputUsedCredits: 70,
      outputUsedCredits: 50,
      expiryTime: new Date('2026-07-20T15:00:00.000Z'),
    };
    const manager = createManager();
    manager.findOne
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(existingPlan);
    manager.find.mockResolvedValueOnce([existingPlan]).mockResolvedValueOnce([]);
    (dataSource.transaction as any).mockImplementation(async (callback: any) =>
      callback(manager),
    );

    const result = await service.subscribePlan(167, paidPlanDto as any);

    expect(result.plan.id).toBe(58);
    expect(result.plan.usedCredits).toBe(0);
    expect(result.plan.inputUsedCredits).toBe(0);
    expect(result.plan.outputUsedCredits).toBe(0);
    expect(paidPlanEventsService.info).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PAID_PLAN_UPDATED_BY_PURCHASE_TOKEN',
        planId: 58,
        oldOrderId: 'GPA.old',
      }),
    );
  });

  it('logs a conflict when an active purchase token belongs to another user', async () => {
    const existingPlan = {
      id: 58,
      userId: 999,
      basePlanId: BasePlanIds.LITE_M1,
      planStatus: PlanStatus.ACTIVE,
      actual: true,
      lastOrderId: 'GPA.old',
      expiryTime: new Date('2026-07-20T15:00:00.000Z'),
    };
    const manager = createManager();
    manager.findOne
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(existingPlan);
    manager.find.mockResolvedValueOnce([existingPlan]);
    (dataSource.transaction as any).mockImplementation(async (callback: any) =>
      callback(manager),
    );

    await expect(service.subscribePlan(167, paidPlanDto as any)).rejects.toThrow(
      'This subscription is already linked to another active account.',
    );

    expect(paidPlanEventsService.conflict).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'SUBSCRIPTION_ALREADY_LINKED',
        userId: 167,
        oldPlanId: 58,
        oldPlanStatus: PlanStatus.ACTIVE,
        metadata: expect.objectContaining({
          oldUserId: 999,
          requestedUserId: 167,
        }),
      }),
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('allows claiming an expired paid token from another user and logs a warning', async () => {
    const expiredPlan = {
      id: 58,
      userId: 999,
      basePlanId: BasePlanIds.LITE_M1,
      planStatus: PlanStatus.EXPIRED,
      actual: true,
      lastOrderId: 'GPA.old',
      usedCredits: 12,
      inputUsedCredits: 7,
      outputUsedCredits: 5,
      expiryTime: new Date('2026-06-20T15:00:00.000Z'),
    };
    const manager = createManager();
    manager.findOne.mockResolvedValueOnce(user).mockResolvedValueOnce(expiredPlan);
    manager.find.mockResolvedValueOnce([expiredPlan]).mockResolvedValueOnce([]);
    (dataSource.transaction as any).mockImplementation(async (callback: any) =>
      callback(manager),
    );

    const result = await service.subscribePlan(167, paidPlanDto as any);

    expect(result.plan.user).toEqual(user);
    expect(paidPlanEventsService.warning).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PAID_PLAN_CLAIMED_FROM_OTHER_USER',
        userId: 167,
        oldPlanId: 58,
        oldPlanStatus: PlanStatus.EXPIRED,
        metadata: expect.objectContaining({
          oldUserId: 999,
          newUserId: 167,
        }),
      }),
    );
    expect(manager.update).toHaveBeenCalledWith(
      expect.any(Function),
      { user: { id: 999 }, actual: true },
      { actual: false },
    );
  });

  it('does not reset credits when the order id did not change', async () => {
    const existingPlan = {
      id: 58,
      userId: 167,
      basePlanId: BasePlanIds.BASE_M1,
      planStatus: PlanStatus.ACTIVE,
      actual: true,
      lastOrderId: 'GPA.new',
      usedCredits: 120,
      inputUsedCredits: 70,
      outputUsedCredits: 50,
      expiryTime: new Date('2026-07-20T15:00:00.000Z'),
    };
    const manager = createManager();
    manager.findOne
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(existingPlan);
    manager.find.mockResolvedValueOnce([existingPlan]).mockResolvedValueOnce([]);
    (dataSource.transaction as any).mockImplementation(async (callback: any) =>
      callback(manager),
    );

    const result = await service.subscribePlan(167, paidPlanDto as any);

    expect(result.plan.usedCredits).toBe(120);
    expect(result.plan.inputUsedCredits).toBe(70);
    expect(result.plan.outputUsedCredits).toBe(50);
    expect(paidPlanEventsService.info).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PAID_PLAN_UPDATED_BY_PURCHASE_TOKEN',
        metadata: expect.objectContaining({
          isNewCreditsCycle: false,
        }),
      }),
    );
  });

  it('logs paid plan updates from updatePlan and resets credits when requested', async () => {
    const existingPlan = {
      id: 58,
      userId: 167,
      basePlanId: BasePlanIds.BASE_M1,
      planStatus: PlanStatus.ACTIVE,
      actual: true,
      purchaseToken: 'token',
      linkedPurchaseToken: null,
      lastOrderId: 'GPA.old',
      usedCredits: 120,
      inputUsedCredits: 70,
      outputUsedCredits: 50,
      expiryTime: new Date('2026-07-20T15:00:00.000Z'),
    };
    (planRepository.findOne as any).mockResolvedValueOnce(existingPlan);
    (planRepository.merge as any).mockImplementation((target: any, data: any) =>
      Object.assign(target, data),
    );
    (planRepository.save as any).mockImplementation(async (plan: any) => plan);

    const result = await service.updatePlan(
      58,
      {
        planStatus: PlanStatus.ACTIVE,
        expiryTime: new Date('2026-08-20T15:00:00.000Z'),
      } as any,
      { resetUsedCredits: true, lastOrderId: 'GPA.new' },
    );

    expect(result?.usedCredits).toBe(0);
    expect(result?.inputUsedCredits).toBe(0);
    expect(result?.outputUsedCredits).toBe(0);
    expect(result?.lastOrderId).toBe('GPA.new');
    expect(paidPlanEventsService.info).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PAID_PLAN_UPDATED',
        planId: 58,
        oldOrderId: 'GPA.old',
        orderId: 'GPA.new',
        metadata: { resetUsedCredits: true },
      }),
    );
  });

  it('findExistingPlan looks up only actual plans by purchase token', async () => {
    const plan = { id: 58, purchaseToken: 'token', actual: true };
    (planRepository.findOne as any).mockResolvedValueOnce(plan);

    const result = await service.findExistingPlan('token');

    expect(result).toBe(plan);
    expect(planRepository.findOne).toHaveBeenCalledWith({
      where: { purchaseToken: 'token', actual: true },
      relations: ['user'],
    });
  });

  it('findExistingPlanForIap looks up plans by purchase token regardless of actual flag', async () => {
    const plan = { id: 58, purchaseToken: 'token', actual: false };
    (planRepository.findOne as any).mockResolvedValueOnce(plan);

    const result = await service.findExistingPlanForIap('token');

    expect(result).toBe(plan);
    expect(planRepository.findOne).toHaveBeenCalledWith({
      where: { purchaseToken: 'token' },
      relations: ['user'],
    });
  });

  it('getActualByUserId returns the current actual plan', async () => {
    const plan = { id: 58, userId: 167, actual: true };
    (planRepository.findOne as any).mockResolvedValueOnce(plan);

    const result = await service.getActualByUserId(167);

    expect(result).toEqual({ plan });
    expect(planRepository.findOne).toHaveBeenCalledWith({
      where: { user: { id: 167 }, actual: true },
    });
  });

  it('returns existing plan after purchase token unique race for the same user', async () => {
    const uniqueError = {
      code: '23505',
      constraint: 'uq_plans_purchase_token',
    };
    const existing = {
      id: 58,
      user: { id: 167 },
      purchaseToken: 'new-token',
    };
    (dataSource.transaction as any).mockRejectedValueOnce(uniqueError);
    (planRepository.findOne as any).mockResolvedValueOnce(existing);

    const result = await service.subscribePlan(167, paidPlanDto as any);

    expect(result).toEqual({ plan: existing });
    expect(planRepository.findOne).toHaveBeenCalledWith({
      where: { purchaseToken: 'new-token' },
      relations: ['user'],
    });
  });

  it('throws when changePlan cannot find the target plan', async () => {
    (planRepository.findOne as any).mockResolvedValueOnce(null);

    await expect(
      service.changePlan(167, { id: 999, actual: false } as any),
    ).rejects.toThrow('Plan 999 does not exist');

    expect(planRepository.findOne).toHaveBeenCalledWith({
      where: { id: 999, user: { id: 167 } },
    });
    expect(planRepository.save).not.toHaveBeenCalled();
  });

  it('logs manual paid plan changes from changePlan', async () => {
    const existingPlan = {
      id: 58,
      userId: 167,
      basePlanId: BasePlanIds.BASE_M1,
      planStatus: PlanStatus.ACTIVE,
      actual: true,
      purchaseToken: 'token',
      linkedPurchaseToken: null,
      lastOrderId: 'GPA.old',
      expiryTime: new Date('2026-07-20T15:00:00.000Z'),
    };
    (planRepository.findOne as any)
      .mockResolvedValueOnce(existingPlan)
      .mockResolvedValueOnce({ id: 58, actual: false });
    (planRepository.merge as any).mockImplementation((target: any, data: any) =>
      Object.assign(target, data),
    );
    (planRepository.save as any).mockImplementation(async (plan: any) => plan);

    await service.changePlan(167, { id: 58, actual: false } as any);

    expect(planRepository.findOne).toHaveBeenCalledWith({
      where: { id: 58, user: { id: 167 } },
    });
    expect(paidPlanEventsService.warning).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PAID_PLAN_MANUAL_CHANGE',
        source: expect.any(String),
        userId: 167,
        planId: 58,
        actualBefore: true,
        actualAfter: false,
      }),
    );
  });

  it('logs paid plan status changes from changePlanStatus', async () => {
    const existingPlan = {
      id: 58,
      userId: 167,
      basePlanId: BasePlanIds.BASE_M1,
      planStatus: PlanStatus.ACTIVE,
      actual: true,
      purchaseToken: 'token',
      linkedPurchaseToken: null,
      lastOrderId: 'GPA.old',
      expiryTime: new Date('2026-07-20T15:00:00.000Z'),
    };
    (planRepository.findOne as any).mockResolvedValueOnce(existingPlan);
    (planRepository.save as any).mockImplementation(async (plan: any) => plan);

    await service.changePlanStatus(58, PlanStatus.EXPIRED);

    expect(paidPlanEventsService.warning).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PAID_PLAN_STATUS_CHANGED',
        userId: 167,
        planId: 58,
        oldPlanStatus: PlanStatus.ACTIVE,
        planStatus: PlanStatus.EXPIRED,
      }),
    );
  });

  it('logs paid plan unsubscribe changes', async () => {
    const existingPlan = {
      id: 58,
      userId: 167,
      basePlanId: BasePlanIds.BASE_M1,
      planStatus: PlanStatus.ACTIVE,
      actual: true,
      purchaseToken: 'token',
      linkedPurchaseToken: null,
      lastOrderId: 'GPA.old',
      expiryTime: new Date('2026-07-20T15:00:00.000Z'),
    };
    (planRepository.findOne as any).mockResolvedValueOnce(existingPlan);
    (planRepository.save as any).mockImplementation(async (plan: any) => plan);

    await service.unsubscribePlan(167);

    expect(planRepository.findOne).toHaveBeenCalledWith({
      where: { user: { id: 167 }, actual: true },
    });
    expect(existingPlan.planStatus).toBe(PlanStatus.CANCELED);
    expect(paidPlanEventsService.warning).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PAID_PLAN_UNSUBSCRIBED',
        userId: 167,
        planId: 58,
        oldPlanStatus: PlanStatus.ACTIVE,
        planStatus: PlanStatus.CANCELED,
      }),
    );
  });

  it('throws when unsubscribePlan is called for an already canceled plan', async () => {
    (planRepository.findOne as any).mockResolvedValueOnce({
      id: 58,
      userId: 167,
      basePlanId: BasePlanIds.BASE_M1,
      planStatus: PlanStatus.CANCELED,
      actual: true,
    });

    await expect(service.unsubscribePlan(167)).rejects.toThrow(
      'Your plan is already canceled',
    );

    expect(planRepository.findOne).toHaveBeenCalledWith({
      where: { user: { id: 167 }, actual: true },
    });
    expect(planRepository.save).not.toHaveBeenCalled();
    expect(paidPlanEventsService.warning).not.toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PAID_PLAN_UNSUBSCRIBED',
      }),
    );
  });

  it('logs paid plans deleted by user id', async () => {
    const paidPlan = {
      id: 58,
      userId: 167,
      basePlanId: BasePlanIds.BASE_M1,
      planStatus: PlanStatus.ACTIVE,
      actual: true,
      purchaseToken: 'token',
      linkedPurchaseToken: null,
      lastOrderId: 'GPA.old',
      expiryTime: new Date('2026-07-20T15:00:00.000Z'),
    };
    (planRepository.find as any).mockResolvedValueOnce([paidPlan]);
    (planRepository.delete as any).mockResolvedValueOnce({ affected: 1 });

    await service.deleteByUserId(167);

    expect(planRepository.delete).toHaveBeenCalledWith({ user: { id: 167 } });
    expect(paidPlanEventsService.warning).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PAID_PLAN_DELETED_BY_USER_ID',
        userId: 167,
        planId: 58,
        actualBefore: true,
      }),
    );
  });

  it('adds calculated credits to the current actual plan', async () => {
    const existingPlan = {
      id: 58,
      userId: 167,
      actual: true,
      usedCredits: 10,
      inputUsedCredits: 4,
      outputUsedCredits: 6,
    };
    (planRepository.findOne as any).mockResolvedValueOnce(existingPlan);
    (planRepository.save as any).mockResolvedValueOnce({
      ...existingPlan,
      usedCredits: 13,
      inputUsedCredits: 5,
      outputUsedCredits: 8,
    });

    await service.calculateCredits(167, AiModel.GPT_5_MINI, 1, 100);

    expect(planRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        usedCredits: 13,
        inputUsedCredits: 5,
        outputUsedCredits: 8,
      }),
    );
  });

  it('throws when calculating credits without an actual plan', async () => {
    (planRepository.findOne as any).mockResolvedValueOnce(null);

    await expect(
      service.calculateCredits(167, AiModel.GPT_5_MINI, 1, 100),
    ).rejects.toThrow('No plan found for the user.');

    expect(planRepository.save).not.toHaveBeenCalled();
  });
});
