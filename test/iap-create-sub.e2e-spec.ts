import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import { IapController } from '../src/iap/iap.controller';
import { IapService } from '../src/iap/iap.service';

describe('IAP create subscription endpoint (e2e)', () => {
  let app: INestApplication;

  const iapService = {
    createAndroidSub: jest.fn(),
    pubSubAndroid: jest.fn(),
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
    await app.close();
  });

  it('POST /iap/create-sub routes Android purchases with the active user id', async () => {
    (iapService.createAndroidSub as any).mockResolvedValueOnce({
      id: 59,
      userId: 167,
      purchaseToken: 'purchase-token',
    });

    await request(app.getHttpServer())
      .post('/iap/create-sub')
      .send({
        platform: 'android',
        packageName: 'app.package',
        productId: 'nemory',
        purchaseToken: 'purchase-token',
        orderId: 'GPA.1',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual({
          id: 59,
          userId: 167,
          purchaseToken: 'purchase-token',
        });
      });

    expect(iapService.createAndroidSub).toHaveBeenCalledWith(
      167,
      'app.package',
      'purchase-token',
    );
  });

  it('POST /iap/create-sub does not call Android creation for iOS payloads', async () => {
    await request(app.getHttpServer())
      .post('/iap/create-sub')
      .send({
        platform: 'ios',
        productId: 'nemory',
        transactionId: 'tx-1',
      })
      .expect(201)
      .expect({});

    expect(iapService.createAndroidSub).not.toHaveBeenCalled();
  });
});
