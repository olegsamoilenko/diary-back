import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import request from 'supertest';
import { IapController } from '../src/iap/iap.controller';
import { IapService } from '../src/iap/iap.service';
import { Platform } from '../src/common/types/platform';
import {
  BasePlanIds,
  PlanStatus,
  SubscriptionIds,
} from '../src/plans/types';
import { PlansService } from '../src/plans/plans.service';

describe('IAP Pub/Sub flow (e2e)', () => {
  let app: INestApplication;
  let iapService: IapService;
  let consoleDirSpy: jest.SpiedFunction<typeof console.dir>;
  let consoleLogSpy: jest.SpiedFunction<typeof console.log>;

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
    usedCredits: 123,
    inputUsedCredits: 80,
    outputUsedCredits: 43,
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
  const paymentsService = {
    create: jest.fn(),
  };
  const planGateway = {
    emitPlanStatusChanged: jest.fn(),
  };
  const paidPlanEventsService = {
    info: jest.fn(),
    warning: jest.fn(),
    conflict: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    consoleDirSpy = jest.spyOn(console, 'dir').mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const plansService = new PlansService(
      planRepository as any,
      dataSource as any,
      {} as any,
      paidPlanEventsService as any,
    );

    iapService = new IapService(
      plansService,
      paymentsService as any,
      usersService as any,
      planGateway as any,
      paidPlanEventsService as any,
    );

    const moduleRef = await Test.createTestingModule({
      controllers: [IapController],
      providers: [{ provide: IapService, useValue: iapService }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    consoleDirSpy.mockRestore();
    consoleLogSpy.mockRestore();
    jest.restoreAllMocks();
    await app.close();
  });

  function encodePayload(payload: Record<string, unknown>): string {
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  }

  it('POST /iap/pub-sub updates an existing plan, resets credits for a new order, emits socket event, and creates payment', async () => {
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

    await request(app.getHttpServer())
      .post('/iap/pub-sub')
      .send({
        message: {
          messageId: 'm1',
          publishTime: '2026-06-25T16:00:00.000Z',
          data: encodePayload({
            version: '1.0',
            packageName: 'app.package',
            subscriptionNotification: {
              version: '1.0',
              notificationType: 2,
              purchaseToken: 'purchase-token',
              subscriptionId: 'nemory',
            },
          }),
        },
      })
      .expect(200)
      .expect('ok');

    expect(iapService.verifyAndroidSub).toHaveBeenCalledWith(
      'app.package',
      'purchase-token',
    );
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
    expect(paidPlanEventsService.info).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PAID_PLAN_UPDATED',
        userId: 167,
        planId: 58,
        oldOrderId: 'GPA.old',
      }),
    );
    expect(paidPlanEventsService.info).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PUBSUB_PLAN_UPDATED',
        userId: 167,
        planId: 58,
        orderId: 'GPA.new',
        oldOrderId: 'GPA.old',
      }),
    );
    expect(planGateway.emitPlanStatusChanged).toHaveBeenCalledWith(167);
    expect(paymentsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'GPA.new',
        amount: 394.99,
        currency: 'UAH',
        user,
        plan: expect.objectContaining({ id: 58, lastOrderId: 'GPA.new' }),
      }),
    );
    expect(paidPlanEventsService.info).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PUBSUB_PAYMENT_CREATED',
        userId: 167,
        planId: 58,
        orderId: 'GPA.new',
      }),
    );
  });

  it('POST /iap/pub-sub logs a conflict for an unknown purchase token and does not create local plan/payment', async () => {
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

    await request(app.getHttpServer())
      .post('/iap/pub-sub')
      .send({
        message: {
          messageId: 'm2',
          publishTime: '2026-06-25T16:00:00.000Z',
          data: encodePayload({
            version: '1.0',
            packageName: 'app.package',
            subscriptionNotification: {
              version: '1.0',
              notificationType: 2,
              purchaseToken: 'purchase-token',
              subscriptionId: 'nemory',
            },
          }),
        },
      })
      .expect(200)
      .expect('ok');

    expect(paidPlanEventsService.conflict).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PUBSUB_UNKNOWN_PURCHASE_TOKEN',
        purchaseToken: 'purchase-token',
        orderId: 'GPA.new',
      }),
    );
    expect(planRepository.save).not.toHaveBeenCalled();
    expect(paymentsService.create).not.toHaveBeenCalled();
    expect(planGateway.emitPlanStatusChanged).not.toHaveBeenCalled();
  });
});
