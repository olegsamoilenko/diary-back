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
import {
  BasePlanIds,
  PlanStatus,
  SubscriptionIds,
} from '../src/plans/types';
import { PlansService } from '../src/plans/plans.service';
import { AiModel, Lang, Theme } from '../src/users/types';
import { UsersController } from '../src/users/users.controller';
import { UsersService } from '../src/users/users.service';

describe('Users create-by-uuid trial flow (e2e)', () => {
  let app: INestApplication;

  const validDevicePubKey = Buffer.alloc(32, 1).toString('base64');
  const savedUser = { id: 167, uuid: 'uuid-1' };
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

  const usersRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };
  const usersSettingsRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };
  const uniqueIdRepository = {
    findOne: jest.fn(),
    create: jest.fn((payload: any) => payload),
    save: jest.fn(async (payload: any) => payload),
  };
  const authService = {
    loginByUUID: jest.fn(),
  };
  const saltService = {
    generateSalt: jest.fn(),
    saveSalt: jest.fn(),
  };
  const aiPreferencesService = {
    ensureDefaults: jest.fn(),
  };
  const geoAccessService = {
    checkAccess: jest.fn(),
    logBlocked: jest.fn(),
    getCountryFromRequest: jest.fn(),
    getClientIp: jest.fn(),
  };
  const paidPlanEventsService = {
    info: jest.fn(),
    warning: jest.fn(),
    conflict: jest.fn(),
  };
  const planRepository = {
    findOne: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(),
  };
  const manager = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((_entity: any, payload: any) => ({
      id: 1,
      userId: payload.user?.id,
      ...payload,
    })),
    save: jest.fn(async (_entity: any, payload: any) => payload),
    update: jest.fn(),
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

    saltService.generateSalt.mockReturnValue('salt-value');
    saltService.saveSalt.mockResolvedValue(undefined as never);
    usersRepository.create.mockImplementation((payload: any) => ({
      ...savedUser,
      ...payload,
    }));
    usersRepository.save.mockImplementation(async (payload: any) => ({
      ...savedUser,
      ...payload,
    }));
    usersSettingsRepository.create.mockImplementation((payload: any) => ({
      id: 10,
      ...payload,
    }));
    usersSettingsRepository.save.mockImplementation(
      async (payload: any) => payload,
    );
    aiPreferencesService.ensureDefaults.mockResolvedValue({ id: 20 } as never);
    authService.loginByUUID.mockResolvedValue({
      accessToken: 'access',
      user: savedUser,
    } as never);

    manager.findOne.mockResolvedValue(savedUser as never);
    manager.find.mockResolvedValue([] as never);
    dataSource.transaction.mockImplementation(async (callback: any) =>
      callback(manager),
    );

    const plansService = new PlansService(
      planRepository as any,
      dataSource as any,
      {} as any,
      paidPlanEventsService as any,
    );
    const usersService = new UsersService(
      usersRepository as any,
      usersSettingsRepository as any,
      uniqueIdRepository as any,
      authService as any,
      {} as any,
      {} as any,
      plansService as any,
      saltService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      aiPreferencesService as any,
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

  function createBody(overrides: Record<string, unknown> = {}) {
    return {
      uuid: 'uuid-1',
      lang: Lang.UK,
      theme: Theme.LIGHT,
      aiModel: AiModel.GPT_5_MINI,
      regionCode: 'UA',
      devicePubKey: validDevicePubKey,
      deviceId: 'device-1',
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
      ...overrides,
    };
  }

  it('POST /users/create-by-uuid creates a free trial plan on the first install without paid-plan logs', async () => {
    uniqueIdRepository.findOne.mockResolvedValueOnce(null as never);

    await request(app.getHttpServer())
      .post('/users/create-by-uuid')
      .set('x-client-ua', 'test-agent')
      .send(createBody())
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual({
          accessToken: 'access',
          user: savedUser,
        });
      });

    expect(uniqueIdRepository.create).toHaveBeenCalledWith({
      uniqueId: 'unique-1',
    });
    expect(uniqueIdRepository.save).toHaveBeenCalledWith({
      uniqueId: 'unique-1',
    });
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.create).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        basePlanId: BasePlanIds.START,
        actual: true,
        price: 0,
        purchaseToken: null,
        user: expect.objectContaining({ id: 167 }),
      }),
    );
    expect(paidPlanEventsService.info).not.toHaveBeenCalled();
    expect(paidPlanEventsService.warning).not.toHaveBeenCalled();
    expect(paidPlanEventsService.conflict).not.toHaveBeenCalled();
    expect(authService.loginByUUID).toHaveBeenCalledWith(
      'uuid-1',
      validDevicePubKey,
      true,
      'device-1',
      'test-agent',
      '10.0.0.1',
    );
  });

  it('POST /users/create-by-uuid does not create a trial plan for a returning install', async () => {
    uniqueIdRepository.findOne.mockResolvedValueOnce({
      id: 1,
      uniqueId: 'unique-1',
    } as never);

    await request(app.getHttpServer())
      .post('/users/create-by-uuid')
      .send(createBody())
      .expect(201);

    expect(uniqueIdRepository.create).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(authService.loginByUUID).toHaveBeenCalledWith(
      'uuid-1',
      validDevicePubKey,
      false,
      'device-1',
      null,
      '10.0.0.1',
    );
  });
});
