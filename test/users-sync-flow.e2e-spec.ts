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
import { GeoAccessService } from '../src/common/geo-access/geo-access.service';
import { Platform } from '../src/common/types/platform';
import { BasePlanIds, PlanStatus } from '../src/plans/types';
import { UsersController } from '../src/users/users.controller';
import { UsersService } from '../src/users/users.service';

describe('Users purchase token sync flow (e2e)', () => {
  let app: INestApplication;

  const validDevicePubKey = Buffer.alloc(32, 1).toString('base64');
  const owner = { id: 167, uuid: 'owner-uuid' };
  const existingPlan = {
    id: 58,
    userId: 167,
    user: { id: 167 },
    purchaseToken: 'purchase-token',
    basePlanId: BasePlanIds.BASE_M1,
    planStatus: PlanStatus.ACTIVE,
    actual: true,
  };

  const usersRepository = {
    findOne: jest.fn(),
  };
  const usersSettingsRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
  };
  const uniqueIdRepository = {
    findOne: jest.fn(),
    create: jest.fn((payload: any) => payload),
    save: jest.fn(async (payload: any) => payload),
  };
  const authService = {
    loginByUUID: jest.fn(),
  };
  const plansService = {
    findExistingPlanForIap: jest.fn(),
    subscribePlan: jest.fn(),
  };
  const geoAccessService = {
    checkAccess: jest.fn(),
    logBlocked: jest.fn(),
    getCountryFromRequest: jest.fn(),
    getClientIp: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    geoAccessService.checkAccess.mockReturnValue({
      blocked: false,
      ip: '10.0.0.1',
      country: 'PL',
      denylist: ['RU', 'BY'],
    });
    geoAccessService.getClientIp.mockReturnValue('10.0.0.1');

    const usersService = new UsersService(
      usersRepository as any,
      usersSettingsRepository as any,
      uniqueIdRepository as any,
      authService as any,
      {} as any,
      {} as any,
      plansService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        { provide: GeoAccessService, useValue: geoAccessService },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use((req, _res, next) => {
      req.clientUa = req.headers['x-client-ua'] || null;
      next();
    });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /users/sync-by-purchase-token logs in the owner of an existing token without creating a plan', async () => {
    (uniqueIdRepository.findOne as any).mockResolvedValueOnce(null);
    (plansService.findExistingPlanForIap as any).mockResolvedValueOnce(
      existingPlan,
    );
    (usersRepository.findOne as any).mockResolvedValueOnce(owner);
    (usersSettingsRepository.findOne as any).mockResolvedValueOnce({
      id: 10,
      user: { id: 167 },
    });
    (authService.loginByUUID as any).mockResolvedValueOnce({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: owner,
    });

    await request(app.getHttpServer())
      .post('/users/sync-by-purchase-token')
      .set('x-client-ua', 'test-agent')
      .send({
        purchaseToken: 'purchase-token',
        devicePubKey: validDevicePubKey,
        deviceId: 'device-1',
        appVersion: '1.0.0',
        appBuild: 100,
        platform: Platform.ANDROID,
        model: 'Pixel',
        osVersion: 'Android 15',
        osBuildId: 'build-1',
        uniqueId: 'unique-1',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual({
          accessToken: 'access',
          refreshToken: 'refresh',
          user: owner,
        });
      });

    expect(uniqueIdRepository.create).toHaveBeenCalledWith({
      uniqueId: 'unique-1',
    });
    expect(uniqueIdRepository.save).toHaveBeenCalledWith({
      uniqueId: 'unique-1',
    });
    expect(plansService.findExistingPlanForIap).toHaveBeenCalledWith(
      'purchase-token',
    );
    expect(plansService.subscribePlan).not.toHaveBeenCalled();
    expect(usersSettingsRepository.update).toHaveBeenCalledWith(10, {
      appVersion: '1.0.0',
      appBuild: 100,
      platform: Platform.ANDROID,
      model: 'Pixel',
      osVersion: 'Android 15',
      osBuildId: 'build-1',
      uniqueId: 'unique-1',
    });
    expect(authService.loginByUUID).toHaveBeenCalledWith(
      'owner-uuid',
      validDevicePubKey,
      false,
      'device-1',
      'test-agent',
      '10.0.0.1',
    );
  });

  it('POST /users/sync-by-purchase-token returns 404 for an unknown token and does not create a plan or session', async () => {
    (plansService.findExistingPlanForIap as any).mockResolvedValueOnce(null);

    await request(app.getHttpServer())
      .post('/users/sync-by-purchase-token')
      .send({
        purchaseToken: 'unknown-token',
        devicePubKey: validDevicePubKey,
        deviceId: 'device-1',
        appVersion: '1.0.0',
        appBuild: 100,
        platform: Platform.ANDROID,
        model: 'Pixel',
        osVersion: 'Android 15',
        osBuildId: 'build-1',
        uniqueId: null,
      })
      .expect(404)
      .expect(({ body }) => {
        expect(body).toEqual(
          expect.objectContaining({
            code: 'PLAN_NOT_FOUND',
            statusCode: 404,
          }),
        );
      });

    expect(plansService.subscribePlan).not.toHaveBeenCalled();
    expect(authService.loginByUUID).not.toHaveBeenCalled();
    expect(usersSettingsRepository.update).not.toHaveBeenCalled();
  });
});
