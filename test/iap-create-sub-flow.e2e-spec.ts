import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
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

describe('IAP create subscription flow (e2e)', () => {
  let app: INestApplication;
  let iapService: IapService;

  const user = { id: 167, uuid: 'uuid-1' };
  const oldPaidPlan = {
    id: 58,
    userId: 167,
    user,
    basePlanId: BasePlanIds.LITE_M1,
    planStatus: PlanStatus.ACTIVE,
    actual: true,
    purchaseToken: 'old-token',
    lastOrderId: 'GPA.old',
    expiryTime: new Date('2026-07-20T15:00:00.000Z'),
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

  const jwtGuard: CanActivate = {
    canActivate(context: ExecutionContext) {
      const req = context.switchToHttp().getRequest();
      req.user = {
        id: 167,
        uuid: 'uuid-1',
        name: 'Test User',
        email: 'test@example.com',
      };
      return true;
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

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
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue(jwtGuard)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  it('POST /iap/create-sub verifies Google data, warns about replacing an active paid plan, and creates the new actual plan', async () => {
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
    const currentGooglePlanData = {
      ...incomingPlanData,
      basePlanId: BasePlanIds.LITE_M1,
      purchaseToken: 'old-token',
      linkedPurchaseToken: null,
      lastOrderId: 'GPA.old',
      expiryTime: new Date('2026-07-20T15:00:00.000Z'),
    };

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
        planData: currentGooglePlanData as any,
        paymentData: {
          platform: Platform.ANDROID,
          regionCode: 'UA',
          orderId: 'GPA.old',
          amount: 394.99,
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

    await request(app.getHttpServer())
      .post('/iap/create-sub')
      .send({
        platform: Platform.ANDROID,
        packageName: 'app.package',
        productId: 'nemory',
        purchaseToken: 'new-token',
        orderId: 'GPA.new',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual(
          expect.objectContaining({
            id: 59,
            userId: 167,
            actual: true,
            purchaseToken: 'new-token',
            basePlanId: BasePlanIds.BASE_M1,
            planStatus: PlanStatus.ACTIVE,
          }),
        );
      });

    expect(iapService.verifyAndroidSub).toHaveBeenNthCalledWith(
      1,
      'app.package',
      'new-token',
    );
    expect(iapService.verifyAndroidSub).toHaveBeenNthCalledWith(
      2,
      'app.package',
      'old-token',
    );
    expect(paidPlanEventsService.warning).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'IAP_CREATE_SUB_REPLACES_ACTIVE_PAID_PLAN',
        userId: 167,
        oldPlanId: 58,
        purchaseToken: 'new-token',
      }),
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
    expect(manager.update).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        user: { id: 167 },
        actual: true,
        id: expect.anything(),
      }),
      { actual: false },
    );
    expect(paymentsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'GPA.new',
        amount: 394.99,
        currency: 'UAH',
        user,
        plan: expect.objectContaining({ id: 59, purchaseToken: 'new-token' }),
      }),
    );
  });
});
