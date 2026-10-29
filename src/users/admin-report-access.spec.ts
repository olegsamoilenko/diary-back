import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AdminJwtStrategy } from '../auth/strategies/admin-jwt.strategies';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { AdminsService } from '../admins/admins.service';
import { AdminRole } from '../admins/types';
import { SupportController } from '../support/support.controller';
import { SupportService } from '../support/support.service';
import { UserMonitoringController } from '../user-monitoring/user-monitoring.controller';
import { UserMonitoringService } from '../user-monitoring/user-monitoring.service';
import { UserStatisticsController } from '../user-statistics/user-statistics.controller';
import { UserStatisticsService } from '../user-statistics/user-statistics.service';
import { UserSettingsController } from './user-settings.controller';
import { UserSettingsService } from './user-settings.service';
import { TokenStatisticsController } from '../tokens/token-statistics.controller';
import { TokenStatisticsService } from '../tokens/token-statistics.service';
import { PlansStatisticsController } from '../plans/plan-statistics.controller';
import { PlanStatisticsService } from '../plans/plan-statistics.service';
import { FinanceStatisticsController } from '../finance-statistics/finance-statistics.controller';
import { FinanceStatisticsService } from '../finance-statistics/finance-statistics.service';
import { AdminFinanceService } from '../finance-statistics/admin-finance.service';
import { ForumModerationController } from '../forum-moderation/forum-moderation.controller';
import { ForumModerationService } from '../forum-moderation/forum-moderation.service';
import { ForumModerationAiUsageService } from '../forum-moderation/services/forum-moderation-ai-usage.service';
import { DiaryStatisticsController } from '../diary-statistics/diary-statistics.controller';
import { DiaryStatisticsService } from '../diary-statistics/diary-statistics.service';
import { FinancePeriod } from '../finance-statistics/types';

// This SDK is ESM and is not involved in these controller tests. All services
// are replaced below; a notification provider must never be called here.
jest.mock('expo-server-sdk', () => ({ Expo: class {} }));

// Actual controllers, cookie parsing, validation and both Passport strategies.
// Isolated services: never bootstrap AppModule, databases, cron or providers.
const controllers = [
  SupportController,
  UserMonitoringController,
  UserStatisticsController,
  UserSettingsController,
  TokenStatisticsController,
  PlansStatisticsController,
  FinanceStatisticsController,
  ForumModerationController,
  DiaryStatisticsController,
];
const services = [
  SupportService,
  UserMonitoringService,
  UserStatisticsService,
  UserSettingsService,
  TokenStatisticsService,
  PlanStatisticsService,
  FinanceStatisticsService,
  AdminFinanceService,
  ForumModerationService,
  ForumModerationAiUsageService,
  DiaryStatisticsService,
];
const mocks = new Map(
  services.map((service) => [
    service,
    Object.fromEntries(
      Object.getOwnPropertyNames(service.prototype)
        .filter((name) => name !== 'constructor')
        .map((name) => [
          name,
          jest.fn(async (..._args: unknown[]) => ({ ok: true })),
        ]),
    ),
  ]),
);
const routes = controllers.flatMap((controller) =>
  Object.getOwnPropertyNames(controller.prototype)
    .filter((name) =>
      Reflect.hasMetadata(METHOD_METADATA, controller.prototype[name]),
    )
    .map((name) => ({
      name,
      method: Reflect.getMetadata(
        METHOD_METADATA,
        controller.prototype[name],
      ) as RequestMethod,
      path: `/${Reflect.getMetadata(PATH_METADATA, controller)}/${Reflect.getMetadata(PATH_METADATA, controller.prototype[name])}`.replace(
        ':id',
        '17',
      ),
    })),
);
const clientNames = [
  'createMessage',
  'addEntryStat',
  'addDialogStat',
  'addCheckinStat',
  'addCheckinDialogStat',
];
const adminRoutes = routes.filter((route) => !clientNames.includes(route.name));

describe('NA-01/02/09 admin reports access', () => {
  const secret = 'synthetic-admin-secret';
  const appSecret = 'synthetic-client-secret';
  const jwt = new JwtService({ secret });
  const token = (extra = {}) =>
    jwt.sign({ id: '7', type: 'admin', ...extra }, { expiresIn: 60 });
  const clientToken = jwt.sign(
    { id: 41, uuid: 'synthetic-user' },
    { secret: appSecret },
  );
  const findAdmin = jest.fn<AdminsService['findById']>();
  let app: INestApplication;
  const oldSecret = process.env.JWT_SECRET;
  const payload = {
    startDate: '2026-10-01',
    endDate: '2026-10-29',
    granularity: 'day',
    type: 'all',
    compact: true,
    userUuid: 'synthetic-user',
    id: 17,
    status: 'CLOSED',
    email: 'test@example.com',
    category: 'QUESTION',
    title: 'Synthetic',
    text: 'Synthetic',
    entryId: 'synthetic-entry',
    hasAiAnalysis: false,
  };
  const call = (route: (typeof routes)[number]) => {
    const http = request(app.getHttpServer());
    if (route.method === RequestMethod.GET)
      return http.get(route.path).query({ period: FinancePeriod.ALL });
    if (route.method === RequestMethod.DELETE)
      return http.delete(route.path).send(payload);
    return http.post(route.path).send(payload);
  };
  const expectNoServiceCalls = () => {
    for (const methods of mocks.values())
      for (const mock of Object.values(methods))
        expect(mock).not.toHaveBeenCalled();
  };
  beforeAll(async () => {
    process.env.JWT_SECRET = appSecret;
    const module = await Test.createTestingModule({
      imports: [PassportModule.register({})],
      controllers,
      providers: [
        AdminJwtStrategy,
        JwtStrategy,
        { provide: ConfigService, useValue: { get: () => secret } },
        { provide: AdminsService, useValue: { findById: findAdmin } },
        ...services.map((service) => ({
          provide: service,
          useValue: mocks.get(service),
        })),
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => {
    await app?.close();
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  });
  beforeEach(() => {
    jest.clearAllMocks();
    findAdmin.mockResolvedValue({
      id: 7,
      active: true,
      role: AdminRole.ADMIN,
    } as never);
  });
  it('covers the complete set of 30 report/admin routes and 5 client routes', () => {
    expect(adminRoutes).toHaveLength(30);
    expect(routes).toHaveLength(35);
  });
  describe.each(adminRoutes)('$path', (route) => {
    it('rejects anonymous access before service reads/writes', async () => {
      await call(route).expect(401);
      expectNoServiceCalls();
    });
    it('rejects a mobile user token', async () => {
      await call(route).auth(clientToken, { type: 'bearer' }).expect(401);
      expectNoServiceCalls();
    });
    it('rejects an expired admin cookie', async () => {
      const expired = jwt.sign({ id: '7', type: 'admin' }, { expiresIn: -1 });
      await call(route).set('Cookie', `admin_session=${expired}`).expect(401);
      expectNoServiceCalls();
    });
    it('rejects inactive admins using the current database state', async () => {
      findAdmin.mockResolvedValueOnce({ id: 7, active: false } as never);
      await call(route)
        .set('Cookie', `admin_session=${token({ active: true })}`)
        .expect(403);
      expectNoServiceCalls();
    });
    it.each([AdminRole.ADMIN, AdminRole.SUPER_ADMIN])(
      'allows %s with the existing landing cookie',
      async (role) => {
        findAdmin.mockResolvedValueOnce({ id: 7, active: true, role } as never);
        const result = await call(route).set(
          'Cookie',
          `admin_session=${token()}`,
        );
        expect(result.status).toBe(
          route.method === RequestMethod.POST ? 201 : 200,
        );
        expect(result.body).toEqual({ ok: true });
      },
    );
    it('retains admin bearer authentication', async () => {
      const result = await call(route).auth(token(), { type: 'bearer' });
      expect(result.status).toBe(
        route.method === RequestMethod.POST ? 201 : 200,
      );
    });
  });
  it.each(routes.filter((route) => clientNames.includes(route.name)))(
    'retains mobile access: $path',
    async (route) => {
      await call(route).expect(401);
      await call(route).auth(clientToken, { type: 'bearer' }).expect(201);
      expect(findAdmin).not.toHaveBeenCalled();
    },
  );
  it('preserves support filters and monitoring mutation arguments', async () => {
    await request(app.getHttpServer())
      .get('/support/get-messages')
      .set('Cookie', `admin_session=${token()}`)
      .query({
        page: 2,
        limit: 20,
        category: 'BUG',
        status: 'OPEN',
        messageId: 17,
        email: 'test@example.com',
        userUuid: 'synthetic-user',
      })
      .expect(200);
    expect(mocks.get(SupportService)?.getMessages).toHaveBeenCalledWith(
      'BUG',
      'OPEN',
      17,
      'test@example.com',
      'synthetic-user',
      2,
      20,
    );
    await call(routes.find((route) => route.name === 'addToMonitoring')!)
      .set('Cookie', `admin_session=${token()}`)
      .expect(201);
    expect(
      mocks.get(UserMonitoringService)?.addToMonitoring,
    ).toHaveBeenCalledWith('synthetic-user', 'all', undefined);
    await call(routes.find((route) => route.name === 'deleteFromMonitoring')!)
      .set('Cookie', `admin_session=${token()}`)
      .expect(200);
    expect(
      mocks.get(UserMonitoringService)?.deleteFromMonitoring,
    ).toHaveBeenCalledWith(17);
  });
});
