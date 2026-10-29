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
import { Test } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AdminJwtStrategy } from '../auth/strategies/admin-jwt.strategies';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { AdminsService } from '../admins/admins.service';
import { CommonNotificationsController } from './common-notifications.controller';
import { ReleaseNotificationsController } from './release-notifications.controller';
import { CommonNotificationsService } from './common-notifications.service';
import { ReleaseNotificationsService } from './release-notifications.service';
import { sanitizeNotificationHtml } from './notification-html';

jest.mock('expo-server-sdk', () => ({ Expo: class {} }));

const formatted =
  '<h2 style="text-align:center">Новини</h2><p><strong>Bold</strong> <em>Italic</em> <u>Underline</u> <s>Strike</s><span style="color:#1976d2">Blue</span></p><ol start="3"><li>One</li></ol><ul><li>Two</li></ul><blockquote>Quote</blockquote><pre><code>const a = 1;</code></pre><a href="https://example.com/news">News</a>';
const unsafe =
  '<img src="https://example.com/a.png" onerror="window.__xss=1"><script>window.__xss=2</script><a href="java&#x73;cript:alert(1)">bad</a><span style="position:fixed;color:#123;background:url(javascript:alert(1))">safe text</span>';
const legacyNote = {
  id: 7,
  platform: 'android',
  build: 100,
  isUrgent: true,
  defaultLocale: 'en',
  translations: [
    { locale: 'en', html: formatted + unsafe, docJson: { type: 'doc' } },
  ],
};
const payload = {
  ...legacyNote,
  translations: [
    { locale: 'en', html: formatted + unsafe, docJson: { type: 'doc' } },
    { locale: 'uk', html: '<p>Оновлення</p>' },
  ],
};

function harness(
  Service:
    | typeof CommonNotificationsService
    | typeof ReleaseNotificationsService,
) {
  const rows: Array<Record<string, unknown>> = [];
  const manager = {
    create: jest.fn((_entity: unknown, value: Record<string, unknown>) => ({
      ...value,
    })),
    save: jest.fn(
      async (
        _entity: unknown,
        translations?: Array<Record<string, unknown>>,
      ) => {
        if (translations) rows.push(...translations);
      },
    ),
    findOneOrFail: jest.fn(async () => ({ ...legacyNote, translations: rows })),
  };
  const transaction = jest.fn(
    async (fn: (manager: unknown) => Promise<unknown>) => fn(manager),
  );
  const qb: Record<string, unknown> = {};
  for (const name of ['leftJoin', 'leftJoinAndSelect', 'where', 'orderBy'])
    qb[name] = jest.fn(() => qb);
  qb.getMany = jest.fn(async () => [legacyNote]);
  const repo = {
    findOne: jest.fn(async () => legacyNote as typeof legacyNote | null),
    findAndCount: jest.fn(async () => [[legacyNote], 1]),
    createQueryBuilder: jest.fn(() => qb),
    delete: jest.fn(async () => ({ affected: 1 })),
  };
  const state = {
    findOne: jest.fn(async () => null),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async () => undefined),
  };
  const service = new Service(
    repo as never,
    {} as never,
    state as never,
    { transaction } as never,
  );
  return { rows, repo, transaction, state, service };
}

describe('NA-03 notification HTTP authorization and real service transformations', () => {
  let app: INestApplication;
  const common = harness(CommonNotificationsService);
  const release = harness(ReleaseNotificationsService);
  const oldSecret = process.env.JWT_SECRET;
  const jwt = new JwtService();
  const userToken = () => jwt.sign({ id: 42 }, { secret: 'synthetic-user' });
  const adminToken = () =>
    jwt.sign({ id: '8', type: 'admin' }, { secret: 'synthetic-admin' });
  const findAdmin = jest.fn(async () => ({
    id: 8,
    active: true,
    role: 'ADMIN',
  }));
  beforeAll(async () => {
    process.env.JWT_SECRET = 'synthetic-user';
    const module = await Test.createTestingModule({
      imports: [PassportModule.register({})],
      controllers: [
        CommonNotificationsController,
        ReleaseNotificationsController,
      ],
      providers: [
        JwtStrategy,
        AdminJwtStrategy,
        { provide: ConfigService, useValue: { get: () => 'synthetic-admin' } },
        { provide: AdminsService, useValue: { findById: findAdmin } },
        { provide: CommonNotificationsService, useValue: common.service },
        { provide: ReleaseNotificationsService, useValue: release.service },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.listen(0, '127.0.0.1');
  });
  beforeEach(() => {
    jest.clearAllMocks();
    common.rows.length = 0;
    release.rows.length = 0;
  });
  afterAll(async () => {
    await app?.close();
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  });

  for (const [prefix, fixture] of [
    ['common', common],
    ['release', release],
  ] as const) {
    describe(prefix, () => {
      for (const method of ['get', 'post', 'delete'] as const) {
        const path = `/${prefix}-notifications${method === 'delete' ? '/7' : ''}`;
        it.each(['anonymous', 'user'])(
          `${method} refuses %s before repository access`,
          async (kind) => {
            const req = request(app.getHttpServer())
              [method](path)
              .send(payload);
            if (kind === 'user') req.auth(userToken(), { type: 'bearer' });
            await req.expect(401);
            expect(fixture.transaction).not.toHaveBeenCalled();
            expect(fixture.repo.delete).not.toHaveBeenCalled();
            expect(fixture.repo.findAndCount).not.toHaveBeenCalled();
          },
        );
      }
      it('admin creates both translations, storing safe formatted HTML and preserving document JSON', async () => {
        fixture.repo.findOne.mockResolvedValueOnce(null);
        const result = await request(app.getHttpServer())
          .post(`/${prefix}-notifications`)
          .set('Cookie', `admin_session=${adminToken()}`)
          .send(payload)
          .expect(201);
        expect(fixture.rows).toHaveLength(2);
        expect(fixture.rows[0].html).toBe(
          sanitizeNotificationHtml(formatted + unsafe),
        );
        expect(fixture.rows[0].docJson).toEqual({ type: 'doc' });
        expect(result.body.translations[0].html).not.toMatch(
          /onerror|__xss|javascript:/i,
        );
        expect(result.body.translations[0].html).toContain(
          '<strong>Bold</strong>',
        );
        expect(result.body.translations[0].html).toContain('color:#1976d2');
      });
      it('admin list cleans legacy rows without rewriting the database or pagination', async () => {
        const res = await request(app.getHttpServer())
          .get(`/${prefix}-notifications?page=2&limit=5&platform=android`)
          .set('Cookie', `admin_session=${adminToken()}`)
          .expect(200);
        expect(res.body).toMatchObject({
          total: 1,
          page: 2,
          limit: 5,
          pageCount: 1,
        });
        expect(res.body.notifications[0].translations[0].html).not.toMatch(
          /onerror|__xss|javascript:/i,
        );
        expect(legacyNote.translations[0].html).toContain('onerror');
        expect(fixture.transaction).not.toHaveBeenCalled();
      });
      it('admin deletes the requested notification', async () => {
        await request(app.getHttpServer())
          .delete(`/${prefix}-notifications/7`)
          .set('Cookie', `admin_session=${adminToken()}`)
          .expect(200);
        expect(fixture.repo.delete).toHaveBeenCalledWith(7);
      });
    });
  }
  it('disabled administrator cannot create', async () => {
    findAdmin.mockResolvedValueOnce({ id: 8, active: false, role: 'ADMIN' });
    await request(app.getHttpServer())
      .post('/common-notifications')
      .set('Cookie', `admin_session=${adminToken()}`)
      .send(payload)
      .expect(403);
    expect(common.transaction).not.toHaveBeenCalled();
  });
  it('mobile latest/read/skip stay authorized by the user session and old HTML is cleaned', async () => {
    const commonRes = await request(app.getHttpServer())
      .get('/common-notifications/latest')
      .auth(userToken(), { type: 'bearer' })
      .expect(200);
    const releaseRes = await request(app.getHttpServer())
      .post('/release-notifications/latest')
      .auth(userToken(), { type: 'bearer' })
      .send({ platform: 'android', build: 99 })
      .expect(201);
    expect(commonRes.body[0].translations[0].html).not.toMatch(
      /onerror|__xss|javascript:/i,
    );
    expect(releaseRes.body).toMatchObject({ build: 100, isUrgent: true });
    expect(releaseRes.body.translations[0].html).not.toMatch(
      /onerror|__xss|javascript:/i,
    );
    await request(app.getHttpServer())
      .post('/common-notifications/mark-as-read')
      .auth(userToken(), { type: 'bearer' })
      .send({ ids: [7] })
      .expect(201);
    expect(common.state.create).toHaveBeenCalledWith({
      user: { id: 42 },
      notification: { id: 7 },
    });
    await request(app.getHttpServer())
      .post('/release-notifications/skip-this-version')
      .auth(userToken(), { type: 'bearer' })
      .send({ platform: 'android', build: 100 })
      .expect(201);
    expect(release.state.create).toHaveBeenCalledWith({
      user: { id: 42 },
      platform: 'android',
      build: 100,
    });
  });
});
