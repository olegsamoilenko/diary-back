import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { IapService } from '../src/iap/iap.service';
import { PaidPlanEventsService } from '../src/paid-plan-events/paid-plan-events.service';
import { PaymentsService } from '../src/payments/payments.service';
import { PlansService } from '../src/plans/plans.service';
import { Platform } from '../src/common/types/platform';
import {
  BasePlanIds,
  PlanStatus,
  SubscriptionIds,
} from '../src/plans/types';

jest.mock('../src/telegram/send-telegram', () => ({
  sendPlansTelegram: jest.fn(),
}));

describe('Subscription create integration flow', () => {
  const user = { id: 167, uuid: 'uuid-1' };
  const oldPaidPlan = {
    id: 58,
    userId: 167,
    user,
    platform: Platform.ANDROID,
    subscriptionId: SubscriptionIds.NEMORY,
    basePlanId: BasePlanIds.LITE_M1,
    planStatus: PlanStatus.ACTIVE,
    actual: true,
    purchaseToken: 'old-token',
    linkedPurchaseToken: null,
    lastOrderId: 'GPA.old',
    expiryTime: new Date('2026-07-20T15:00:00.000Z'),
  };
  const incomingPlanData = {
    platform: Platform.ANDROID,
    regionCode: 'UA',
    subscriptionId: SubscriptionIds.NEMORY,
    basePlanId: BasePlanIds.BASE_M1,
    price: 394.99,
    currency: 'UAH',
    purchaseToken: 'new-token',
    linkedPurchaseToken: 'old-token',
    startTime: new Date('2026-06-25T16:00:00.000Z'),
    expiryTime: new Date('2026-07-25T16:00:00.000Z'),
    autoRenewEnabled: true,
    planStatus: PlanStatus.ACTIVE,
    lastOrderId: 'GPA.new',
  };

  const savedEvents: any[] = [];
  const paidPlanEventRepository = {
    create: jest.fn((payload: any) => payload),
    save: jest.fn(async (event: any) => {
      const saved = {
        id: String(savedEvents.length + 1),
        ...event,
        createdAt: new Date('2026-06-25T16:10:00.000Z'),
      };
      savedEvents.push(saved);
      return saved;
    }),
  };
  const paymentRepository = {
    findOne: jest.fn(),
    create: jest.fn((payload: any) => ({ id: 601, ...payload })),
    save: jest.fn(async (payment: any) => payment),
  };
  const manager = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((_entity: any, payload: any) => ({
      id: 59,
      userId: payload.user?.id,
      ...payload,
    })),
    merge: jest.fn((_entity: any, target: any, payload: any) =>
      Object.assign(target, payload),
    ),
    save: jest.fn(async (_entity: any, payload: any) => payload),
    update: jest.fn(),
  };
  const planRepository = {
    findOne: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(),
  };
  const usersService = {
    findById: jest.fn(),
  };
  const planGateway = {
    emitPlanStatusChanged: jest.fn(),
  };

  let iapService: IapService;

  beforeEach(() => {
    jest.clearAllMocks();
    savedEvents.length = 0;

    const paidPlanEventsService = new PaidPlanEventsService(
      paidPlanEventRepository as any,
    );
    const paymentsService = new PaymentsService(paymentRepository as any);
    const plansService = new PlansService(
      planRepository as any,
      dataSource as any,
      {} as any,
      paidPlanEventsService,
    );
    iapService = new IapService(
      plansService,
      paymentsService,
      usersService as any,
      planGateway as any,
      paidPlanEventsService,
    );
  });

  it('creates a new paid plan, deactivates the old actual paid plan, records audit events, and creates payment', async () => {
    jest
      .spyOn(iapService, 'verifyAndroidSub')
      .mockResolvedValueOnce({
        planData: incomingPlanData as any,
        paymentData: {
          platform: Platform.ANDROID,
          regionCode: 'UA',
          orderId: 'GPA.new',
          amount: 394.99,
          currency: 'UAH',
        },
        googleData: {
          subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
          lineItems: [],
        },
      } as any)
      .mockResolvedValueOnce({
        planData: {
          ...incomingPlanData,
          basePlanId: BasePlanIds.LITE_M1,
          purchaseToken: 'old-token',
          linkedPurchaseToken: null,
          lastOrderId: 'GPA.old',
          expiryTime: oldPaidPlan.expiryTime,
        } as any,
        paymentData: {
          platform: Platform.ANDROID,
          regionCode: 'UA',
          orderId: 'GPA.old',
          amount: 199.99,
          currency: 'UAH',
        },
        googleData: {
          subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
          lineItems: [],
        },
      } as any);

    (usersService.findById as any).mockResolvedValueOnce(user);
    (planRepository.findOne as any).mockResolvedValueOnce(oldPaidPlan);
    (manager.findOne as any)
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(null);
    (manager.find as any)
      .mockResolvedValueOnce([oldPaidPlan])
      .mockResolvedValueOnce([oldPaidPlan]);
    (dataSource.transaction as any).mockImplementation(async (callback: any) =>
      callback(manager),
    );
    (paymentRepository.findOne as any).mockResolvedValueOnce(null);

    const plan = await iapService.createAndroidSub(
      167,
      'app.package',
      'new-token',
    );

    expect(plan).toEqual(
      expect.objectContaining({
        id: 59,
        userId: 167,
        actual: true,
        purchaseToken: 'new-token',
        basePlanId: BasePlanIds.BASE_M1,
        planStatus: PlanStatus.ACTIVE,
      }),
    );
    expect(manager.update).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        user: { id: 167 },
        actual: true,
        id: expect.anything(),
      }),
      { actual: false },
    );
    expect(paymentRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'GPA.new',
        amount: 394.99,
        currency: 'UAH',
        user,
        plan: expect.objectContaining({ id: 59, purchaseToken: 'new-token' }),
      }),
    );

    expect(savedEvents.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        'IAP_CREATE_SUB_RECEIVED',
        'IAP_CREATE_SUB_GOOGLE_VERIFIED',
        'IAP_CREATE_SUB_REPLACES_ACTIVE_PAID_PLAN',
        'PAID_PLAN_CREATED',
        'PAID_PLAN_ACTUAL_SWITCH',
      ]),
    );
    expect(savedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'IAP_CREATE_SUB_REPLACES_ACTIVE_PAID_PLAN',
          severity: 'WARNING',
          oldPlanId: 58,
          userId: 167,
          purchaseTokenHash: expect.any(String),
          purchaseTokenSuffix: 'new-token',
        }),
        expect.objectContaining({
          eventType: 'PAID_PLAN_CREATED',
          severity: 'INFO',
          planId: 59,
          userId: 167,
          purchaseTokenHash: expect.any(String),
          purchaseTokenSuffix: 'new-token',
        }),
        expect.objectContaining({
          eventType: 'PAID_PLAN_ACTUAL_SWITCH',
          severity: 'WARNING',
          oldPlanId: 58,
          newPlanId: 59,
          actualBefore: true,
          actualAfter: false,
        }),
      ]),
    );
    for (const event of savedEvents) {
      expect(event.purchaseToken).toBeUndefined();
      expect(event.linkedPurchaseToken).toBeUndefined();
    }
  });
});
