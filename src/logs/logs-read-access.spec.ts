import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AdminsService } from '../admins/admins.service';
import { AdminRole } from '../admins/types';
import { AdminJwtStrategy } from '../auth/strategies/admin-jwt.strategies';
import { CustomThrottlerGuard } from '../common/guards/custom-throttler.guard';
import { LogsController } from './logs.controller';
import { LogsService } from './logs.service';

// Synthetic records only: real HTTP/controller/admin JWT strategy and global
// throttler, with no database, real log reads, deployed API or provider calls.
describe('Diagnostic log read access', () => {
  const secret = 'local-log-read-admin-secret';
  const jwt = new JwtService({ secret });
  const page = {
    logs: [{ name: 'SYNTHETIC_LOG_ONLY' }],
    total: 1,
    page: 1,
    pageCount: 1,
    limit: 10,
  };
  const getLogs = jest.fn(async () => page);
  const getLogsByUuid = jest.fn(async () => page);
  const getServerLogs = jest.fn(async () => page);
  const ingestBatch = jest.fn(async () => ({ inserted: 1 }));
  const findAdmin = jest.fn<AdminsService['findById']>();
  let app: INestApplication;

  const token = (payload: Record<string, unknown> = {}) =>
    jwt.sign({ id: '7', type: 'admin', ...payload }, { expiresIn: 60 });
  const routes = [
    { method: 'get', path: '/logs/get-logs', read: getLogs },
    { method: 'post', path: '/logs/get-logs-by-uuid', read: getLogsByUuid },
    { method: 'get', path: '/logs/get-server-logs', read: getServerLogs },
  ] as const;
  const call = (route: (typeof routes)[number]) => {
    const client = request(app.getHttpServer());
    return route.method === 'post'
      ? client
          .post(route.path)
          .send({ uuid: 'synthetic-user', level: 'info', page: 1, limit: 10 })
      : client.get(route.path);
  };
  const expectNoReads = () => {
    expect(getLogs).not.toHaveBeenCalled();
    expect(getLogsByUuid).not.toHaveBeenCalled();
    expect(getServerLogs).not.toHaveBeenCalled();
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        PassportModule.register({}),
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 500 }]),
      ],
      controllers: [LogsController],
      providers: [
        AdminJwtStrategy,
        { provide: ConfigService, useValue: { get: () => secret } },
        { provide: AdminsService, useValue: { findById: findAdmin } },
        {
          provide: LogsService,
          useValue: { getLogs, getLogsByUuid, getServerLogs, ingestBatch },
        },
        { provide: APP_GUARD, useClass: CustomThrottlerGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => app?.close());
  beforeEach(() => {
    jest.clearAllMocks();
    findAdmin.mockResolvedValue({
      id: 7,
      role: AdminRole.ADMIN,
      active: true,
      email: 'admin@example.com',
    } as never);
  });

  describe.each(routes)('$method $path', (route) => {
    it('rejects anonymous reads before accessing diagnostics', async () => {
      const result = await call(route).expect(401);
      expect(JSON.stringify(result.body)).not.toContain('SYNTHETIC_LOG_ONLY');
      expectNoReads();
    });
    it('rejects an ordinary app token even claiming an admin role', async () => {
      const appToken = jwt.sign(
        { id: 7, type: 'admin', role: 'SUPER_ADMIN' },
        { secret: 'local-log-app-secret' },
      );
      await call(route).auth(appToken, { type: 'bearer' }).expect(401);
      expectNoReads();
    });
    it('rejects the wrong token purpose even with the admin signing key', async () => {
      await call(route)
        .auth(token({ type: 'user' }), { type: 'bearer' })
        .expect(401);
      expectNoReads();
    });
    it('rejects an expired admin cookie', async () => {
      const expired = jwt.sign({ id: '7', type: 'admin' }, { expiresIn: -1 });
      await call(route).set('Cookie', `admin_session=${expired}`).expect(401);
      expectNoReads();
    });
    it('rejects a missing admin identity', async () => {
      findAdmin.mockResolvedValueOnce(null);
      await call(route).auth(token(), { type: 'bearer' }).expect(401);
      expectNoReads();
    });
    it('rejects an inactive admin despite a valid token', async () => {
      findAdmin.mockResolvedValueOnce({
        id: 7,
        role: AdminRole.SUPER_ADMIN,
        active: false,
      } as never);
      await call(route)
        .auth(token({ active: true }), { type: 'bearer' })
        .expect(403);
      expectNoReads();
    });
    it.each([AdminRole.ADMIN, AdminRole.SUPER_ADMIN])(
      'allows active %s via the landing cookie',
      async (role) => {
        findAdmin.mockResolvedValueOnce({ id: 7, role, active: true } as never);
        const result = await call(route)
          .set('Cookie', `admin_session=${token()}`)
          .expect(route.method === 'post' ? 201 : 200);
        expect(result.body).toEqual(page);
        expect(route.read).toHaveBeenCalledTimes(1);
        expect(findAdmin).toHaveBeenCalledWith(7);
      },
    );
    it('allows an active admin bearer token', async () => {
      await call(route)
        .auth(token(), { type: 'bearer' })
        .expect(route.method === 'post' ? 201 : 200);
      expect(route.read).toHaveBeenCalledTimes(1);
    });
  });

  it('retains client-log filter/search/pagination arguments', async () => {
    await request(app.getHttpServer())
      .get('/logs/get-logs')
      .set('Cookie', `admin_session=${token()}`)
      .query({
        startDate: '2026-10-26',
        endDate: '2026-10-27',
        level: 'error',
        userId: 41,
        userUuid: 'synthetic-user',
        searchTerm: 'synthetic',
        page: 2,
        limit: 20,
      })
      .expect(200);
    expect(getLogs).toHaveBeenCalledWith(
      '2026-10-26',
      '2026-10-27',
      'error',
      41,
      'synthetic-user',
      'synthetic',
      2,
      20,
    );
  });
  it('retains per-user POST body and response status', async () => {
    await request(app.getHttpServer())
      .post('/logs/get-logs-by-uuid')
      .set('Cookie', `admin_session=${token()}`)
      .send({
        uuid: 'synthetic-user',
        level: 'warn',
        page: 2,
        limit: 20,
        searchTerm: 'synthetic',
      })
      .expect(201);
    expect(getLogsByUuid).toHaveBeenCalledWith(
      'synthetic-user',
      'warn',
      2,
      20,
      'synthetic',
    );
  });
  it('retains server-log filters and pagination', async () => {
    await request(app.getHttpServer())
      .get('/logs/get-server-logs')
      .set('Cookie', `admin_session=${token()}`)
      .query({
        startDate: '2026-10-26',
        endDate: '2026-10-27',
        level: 'warn',
        userId: 41,
        userUuid: 'synthetic-user',
        page: 2,
        limit: 20,
      })
      .expect(200);
    expect(getServerLogs).toHaveBeenCalledWith(
      '2026-10-26',
      '2026-10-27',
      'warn',
      41,
      'synthetic-user',
      2,
      20,
    );
  });

  const event = {
    ts: 1793077200000,
    level: 'info',
    kind: 'app',
    name: 'synthetic-startup',
    data: { fixture: true },
  };
  it.each([false, true])(
    'retains log ingestion with app authentication=%s',
    async (authenticated) => {
      const req = request(app.getHttpServer())
        .post('/logs')
        .send({ events: [event] });
      if (authenticated)
        req.auth(jwt.sign({ id: 41 }, { secret: 'local-log-app-secret' }), {
          type: 'bearer',
        });
      const result = await req.expect(201);
      expect(result.body).toMatchObject({
        ok: true,
        inserted: 1,
        requestId: expect.any(String),
      });
      expect(ingestBatch).toHaveBeenCalledWith(
        { events: [event] },
        expect.objectContaining({ requestId: result.body.requestId }),
      );
      expect(findAdmin).not.toHaveBeenCalled();
      expectNoReads();
    },
  );
  it('retains ingestion validation', async () => {
    await request(app.getHttpServer())
      .post('/logs')
      .send({ events: [{ ...event, name: '' }] })
      .expect(400);
    expect(ingestBatch).not.toHaveBeenCalled();
    expectNoReads();
  });
});
