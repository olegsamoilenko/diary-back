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
import { UsersController } from '../src/users/users.controller';
import { UsersService } from '../src/users/users.service';
import { GeoAccessService } from '../src/common/geo-access/geo-access.service';
import { Platform } from '../src/common/types/platform';
import { AiModel, Lang, Theme } from '../src/users/types';
import {
  BasePlanIds,
  PlanStatus,
  SubscriptionIds,
} from '../src/plans/types';

describe('Users subscription boot endpoints (e2e)', () => {
  let app: INestApplication;

  const usersService = {
    createUserByUUID: jest.fn(),
    syncUser: jest.fn(),
    me: jest.fn(),
  };
  const geoAccessService = {
    checkAccess: jest.fn(),
    logBlocked: jest.fn(),
    getCountryFromRequest: jest.fn(),
    getClientIp: jest.fn(),
  };

  const trialPlanData = {
    platform: Platform.ANDROID,
    regionCode: 'UA',
    subscriptionId: SubscriptionIds.NEMORY,
    basePlanId: BasePlanIds.START,
    startTime: '2026-06-25T15:00:00.000Z',
    expiryTime: '2026-07-02T15:00:00.000Z',
    planStatus: PlanStatus.ACTIVE,
    autoRenewEnabled: false,
    purchaseToken: null,
    linkedPurchaseToken: null,
    lastOrderId: null,
    price: 0,
    currency: 'UAH',
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
    geoAccessService.checkAccess.mockReturnValue({
      blocked: false,
      ip: '10.0.0.1',
      country: 'PL',
      denylist: ['RU', 'BY'],
    });
    geoAccessService.getCountryFromRequest.mockReturnValue('PL');
    geoAccessService.getClientIp.mockReturnValue('10.0.0.1');

    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        { provide: GeoAccessService, useValue: geoAccessService },
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue(jwtGuard)
      .compile();

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

  it('POST /users/create-by-uuid passes planData and client metadata to UsersService', async () => {
    (usersService.createUserByUUID as any).mockResolvedValueOnce({
      accessToken: 'access',
      user: { id: 167 },
    });

    await request(app.getHttpServer())
      .post('/users/create-by-uuid')
      .set('x-client-ua', 'test-agent')
      .send({
        uuid: 'uuid-1',
        lang: Lang.UK,
        theme: Theme.LIGHT,
        aiModel: AiModel.GPT_5_MINI,
        regionCode: 'UA',
        devicePubKey: 'device-pub-key',
        appVersion: '1.0.0',
        appBuild: 100,
        platform: Platform.ANDROID,
        locale: 'uk-UA',
        timezone: 'Europe/Kiev',
        firstDayOfWeek: 1,
        model: 'Pixel',
        osVersion: 'Android 15',
        osBuildId: 'build-1',
        uniqueId: 'unique-1',
        acquisitionSource: 'organic',
        acquisitionMetaJson: { campaign: 'none' },
        planData: trialPlanData,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual({
          accessToken: 'access',
          user: { id: 167 },
        });
      });

    expect(usersService.createUserByUUID).toHaveBeenCalledWith(
      'uuid-1',
      Lang.UK,
      Theme.LIGHT,
      AiModel.GPT_5_MINI,
      Platform.ANDROID,
      'PL',
      'device-pub-key',
      null,
      '1.0.0',
      100,
      'uk-UA',
      'Europe/Kiev',
      1,
      'Pixel',
      'Android 15',
      'build-1',
      'unique-1',
      'organic',
      { campaign: 'none' },
      trialPlanData,
      'test-agent',
      '10.0.0.1',
    );
  });

  it('POST /users/sync-by-purchase-token passes purchaseToken and device metadata to UsersService', async () => {
    (usersService.syncUser as any).mockResolvedValueOnce({
      accessToken: 'access',
      user: { id: 167 },
    });

    await request(app.getHttpServer())
      .post('/users/sync-by-purchase-token')
      .set('x-client-ua', 'test-agent')
      .send({
        purchaseToken: 'purchase-token',
        devicePubKey: 'device-pub-key',
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
          user: { id: 167 },
        });
      });

    expect(usersService.syncUser).toHaveBeenCalledWith(
      'purchase-token',
      'device-pub-key',
      null,
      '1.0.0',
      100,
      Platform.ANDROID,
      'Pixel',
      'Android 15',
      'build-1',
      'unique-1',
      'test-agent',
      '10.0.0.1',
    );
  });

  it('blocks boot endpoints when BlockedCountriesGuard rejects the country', async () => {
    geoAccessService.checkAccess.mockReturnValueOnce({
      blocked: true,
      ip: '10.0.0.1',
      country: 'RU',
      denylist: ['RU', 'BY'],
    });

    await request(app.getHttpServer())
      .post('/users/sync-by-purchase-token')
      .send({
        purchaseToken: 'purchase-token',
        devicePubKey: 'device-pub-key',
        appVersion: '1.0.0',
        appBuild: 100,
        platform: Platform.ANDROID,
        model: 'Pixel',
        osVersion: 'Android 15',
        osBuildId: 'build-1',
        uniqueId: null,
      })
      .expect(403);

    expect(usersService.syncUser).not.toHaveBeenCalled();
    expect(geoAccessService.logBlocked).toHaveBeenCalledWith(
      expect.objectContaining({
        ip: '10.0.0.1',
        country: 'RU',
      }),
    );
  });

  it('POST /users/me reads the current user with hash and returns actual plan data', async () => {
    (usersService.me as any).mockResolvedValueOnce({
      user: { id: 167, uuid: 'uuid-1' },
      plan: {
        id: 59,
        userId: 167,
        actual: true,
        planStatus: PlanStatus.ACTIVE,
      },
    });

    await request(app.getHttpServer())
      .post('/users/me')
      .send({ hash: 'hash-1' })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual({
          user: { id: 167, uuid: 'uuid-1' },
          plan: {
            id: 59,
            userId: 167,
            actual: true,
            planStatus: PlanStatus.ACTIVE,
          },
        });
      });

    expect(usersService.me).toHaveBeenCalledWith('uuid-1', 'hash-1');
  });
});
