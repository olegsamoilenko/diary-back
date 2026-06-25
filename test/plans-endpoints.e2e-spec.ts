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
import { PlansController } from '../src/plans/plans.controller';
import { PlansService } from '../src/plans/plans.service';

describe('Plans endpoints (e2e)', () => {
  let app: INestApplication;

  const plansService = {
    subscribePlan: jest.fn(),
    unsubscribePlan: jest.fn(),
    getActualByUserId: jest.fn(),
    changePlan: jest.fn(),
    changePlanStatus: jest.fn(),
  };

  const jwtGuard: CanActivate = {
    canActivate(context: ExecutionContext) {
      const req = context.switchToHttp().getRequest();
      req.user = { id: 167, uuid: 'uuid-1' };
      return true;
    },
  };

  const adminJwtGuard: CanActivate = {
    canActivate(context: ExecutionContext) {
      const req = context.switchToHttp().getRequest();
      req.user = { id: 1, role: 'admin' };
      return true;
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [PlansController],
      providers: [{ provide: PlansService, useValue: plansService }],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue(jwtGuard)
      .overrideGuard(AuthGuard('admin-jwt'))
      .useValue(adminJwtGuard)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /plans/subscribe creates a start plan for the active user', async () => {
    const dto = {
      subscriptionId: 'nemory',
      basePlanId: 'start-d7',
      startTime: '2026-06-25T16:00:00.000Z',
      expiryTime: '2026-07-02T16:00:00.000Z',
      planStatus: 'ACTIVE',
      autoRenewEnabled: false,
      lastOrderId: null,
      linkedPurchaseToken: null,
      platform: 'android',
      regionCode: 'UA',
      price: 0,
      currency: 'UAH',
    };

    (plansService.subscribePlan as any).mockResolvedValueOnce({
      id: 59,
      userId: 167,
      actual: true,
    });

    await request(app.getHttpServer())
      .post('/plans/subscribe')
      .send(dto)
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual({ id: 59, userId: 167, actual: true });
      });

    expect(plansService.subscribePlan).toHaveBeenCalledWith(167, dto);
  });

  it('POST /plans/subscribe rejects paid plan creation without IAP verification', async () => {
    await request(app.getHttpServer())
      .post('/plans/subscribe')
      .send({
        subscriptionId: 'nemory',
        basePlanId: 'base-m1',
        startTime: '2026-06-25T16:00:00.000Z',
        expiryTime: '2026-07-25T16:00:00.000Z',
        planStatus: 'ACTIVE',
        autoRenewEnabled: true,
        purchaseToken: 'purchase-token',
        lastOrderId: 'GPA.1',
        linkedPurchaseToken: null,
        platform: 'android',
        regionCode: 'UA',
        price: 394.99,
        currency: 'UAH',
      })
      .expect(403)
      .expect(({ body }) => {
        expect(body).toEqual(
          expect.objectContaining({
            code: 'PAID_PLAN_REQUIRES_IAP_CREATE_SUB',
          }),
        );
      });

    expect(plansService.subscribePlan).not.toHaveBeenCalled();
  });

  it('POST /plans/unsubscribe targets the active user plan', async () => {
    (plansService.unsubscribePlan as any).mockResolvedValueOnce({
      id: 59,
      planStatus: 'CANCELED',
    });

    await request(app.getHttpServer())
      .post('/plans/unsubscribe')
      .send()
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual({ id: 59, planStatus: 'CANCELED' });
      });

    expect(plansService.unsubscribePlan).toHaveBeenCalledWith(167);
  });

  it('GET /plans/get-actual returns the active user actual plan', async () => {
    (plansService.getActualByUserId as any).mockResolvedValueOnce({
      id: 59,
      userId: 167,
      actual: true,
    });

    await request(app.getHttpServer())
      .get('/plans/get-actual')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ id: 59, userId: 167, actual: true });
      });

    expect(plansService.getActualByUserId).toHaveBeenCalledWith(167);
  });

  it('POST /plans/change-plan switches the active user plan', async () => {
    const dto = { id: 60, actual: true };

    (plansService.changePlan as any).mockResolvedValueOnce({
      id: 60,
      userId: 167,
      actual: true,
    });

    await request(app.getHttpServer())
      .post('/plans/change-plan')
      .send(dto)
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual({ id: 60, userId: 167, actual: true });
      });

    expect(plansService.changePlan).toHaveBeenCalledWith(167, dto);
  });

  it('POST /plans/change-plan-status uses the admin guard route', async () => {
    (plansService.changePlanStatus as any).mockResolvedValueOnce({
      id: 59,
      planStatus: 'EXPIRED',
    });

    await request(app.getHttpServer())
      .post('/plans/change-plan-status')
      .send({ id: 59, planStatus: 'EXPIRED' })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual({ id: 59, planStatus: 'EXPIRED' });
      });

    expect(plansService.changePlanStatus).toHaveBeenCalledWith(59, 'EXPIRED');
  });
});
