import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
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

describe('Subscription Pub/Sub integration flow', () => {
  const user = { id: 167, uuid: 'uuid-1' };
  const existingPlan = {
    id: 58,
    userId: 167,
    user,
    platform: Platform.ANDROID,
    regionCode: 'UA',
    subscriptionId: SubscriptionIds.NEMORY,
    basePlanId: BasePlanIds.LITE_M1,
    price: 199.99,
    currency: 'UAH',
    planStatus: PlanStatus.ACTIVE,
    actual: true,
    purchaseToken: 'purchase-token',
    linkedPurchaseToken: null,
    lastOrderId: 'GPA.old',
    startTime: new Date('2026-05-25T16:00:00.000Z'),
    expiryTime: new Date('2026-06-25T16:00:00.000Z'),
    autoRenewEnabled: true,
    usedCredits: 120,
    inputUsedCredits: 70,
    outputUsedCredits: 50,
  };
  const renewedPlanData = {
    platform: Platform.ANDROID,
    regionCode: 'UA',
    subscriptionId: SubscriptionIds.NEMORY,
    basePlanId: BasePlanIds.BASE_M1,
    price: 394.99,
    currency: 'UAH',
    purchaseToken: 'purchase-token',
    linkedPurchaseToken: null,
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
  const planRepository = {
    findOne: jest.fn(),
    merge: jest.fn((target: any, payload: any) => Object.assign(target, payload)),
    save: jest.fn(async (payload: any) => payload),
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
  let consoleLogSpy: jest.SpiedFunction<typeof console.log>;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
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

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('updates an existing paid plan from Pub/Sub, resets credits for a new order, emits socket event, and creates payment', async () => {
    jest.spyOn(iapService, 'verifyAndroidSub').mockResolvedValueOnce({
      planData: renewedPlanData as any,
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
    } as any);

    (planRepository.findOne as any)
      .mockResolvedValueOnce({ ...existingPlan })
      .mockResolvedValueOnce({ ...existingPlan });
    (usersService.findById as any).mockResolvedValueOnce(user);
    (paymentRepository.findOne as any).mockResolvedValueOnce(null);

    const result = await iapService.pubSubAndroid(
      'app.package',
      'purchase-token',
      2,
    );

    expect(result).toBe(true);
    expect(planRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 58,
        basePlanId: BasePlanIds.BASE_M1,
        planStatus: PlanStatus.ACTIVE,
        expiryTime: renewedPlanData.expiryTime,
        lastOrderId: 'GPA.new',
        usedCredits: 0,
        inputUsedCredits: 0,
        outputUsedCredits: 0,
      }),
    );
    expect(planGateway.emitPlanStatusChanged).toHaveBeenCalledWith(167);
    expect(paymentRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'GPA.new',
        amount: 394.99,
        currency: 'UAH',
        user,
        plan: expect.objectContaining({ id: 58, lastOrderId: 'GPA.new' }),
      }),
    );
    expect(savedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'PUBSUB_RECEIVED',
          severity: 'INFO',
          purchaseTokenSuffix: 'hase-token',
        }),
        expect.objectContaining({
          eventType: 'PAID_PLAN_UPDATED',
          severity: 'INFO',
          planId: 58,
          oldOrderId: 'GPA.old',
          actualBefore: true,
          actualAfter: true,
        }),
        expect.objectContaining({
          eventType: 'PUBSUB_PLAN_UPDATED',
          severity: 'INFO',
          userId: 167,
          planId: 58,
          orderId: 'GPA.new',
          oldOrderId: 'GPA.old',
        }),
        expect.objectContaining({
          eventType: 'PUBSUB_PAYMENT_CREATED',
          severity: 'INFO',
          userId: 167,
          planId: 58,
          orderId: 'GPA.new',
        }),
      ]),
    );
  });

  it('records conflict for an unknown Pub/Sub purchase token without creating plan or payment', async () => {
    jest.spyOn(iapService, 'verifyAndroidSub').mockResolvedValueOnce({
      planData: renewedPlanData as any,
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
    } as any);
    (planRepository.findOne as any).mockResolvedValueOnce(null);

    const result = await iapService.pubSubAndroid(
      'app.package',
      'purchase-token',
      2,
    );

    expect(result).toBeUndefined();
    expect(planRepository.save).not.toHaveBeenCalled();
    expect(paymentRepository.save).not.toHaveBeenCalled();
    expect(planGateway.emitPlanStatusChanged).not.toHaveBeenCalled();
    expect(savedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'PUBSUB_UNKNOWN_PURCHASE_TOKEN',
          severity: 'CONFLICT',
          purchaseTokenSuffix: 'hase-token',
          orderId: 'GPA.new',
        }),
      ]),
    );
  });
});
