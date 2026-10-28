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
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminsService } from '../admins/admins.service';
import { AdminRole } from '../admins/types';
import { AdminJwtStrategy } from '../auth/strategies/admin-jwt.strategies';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { GeoAccessService } from '../common/geo-access/geo-access.service';
import { generateHash } from '../common/utils/generateHash';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// Real HTTP, Passport, production ValidationPipe options and service.update.
// Only repositories/subscription/statistics boundaries are synthetic.
describe('Public profile update boundary', () => {
  const secret = 'local-profile-test-secret';
  const adminSecret = 'local-profile-admin-test-secret';
  const salt = 'synthetic-salt';
  const owner = { id: 41, uuid: 'profile-owner', name: 'Before', role: 'user' };
  const hash = generateHash(owner.uuid, salt);
  const jwt = new JwtService({ secret });
  let app: INestApplication;
  let users: UsersService;
  let row: Record<string, unknown>;
  const update = jest.fn(
    async (_id: number, patch: Record<string, unknown>) => {
      Object.assign(row, patch);
      return { affected: 1 };
    },
  );
  const settingsUpdate = jest.fn(async () => ({ affected: 1 }));
  const activity = jest.fn(async () => undefined);
  const syncLegacy = jest.fn(async () => undefined);
  const findByUUID = jest.fn(async (_uuid: string) => row);

  const token = () => jwt.sign(owner, { expiresIn: 60 });
  const patch = (body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .patch('/users/update')
      .auth(token(), { type: 'bearer' })
      .send({ hash, ...body });

  beforeAll(async () => {
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = secret;
    try {
      users = Object.assign(
        Object.create(UsersService.prototype) as UsersService,
        {
          findByUUID,
          saltService: { getSaltByUserId: async () => ({ value: salt }) },
          usersRepository: { update, findOne: async () => ({ ...row }) },
          usersSettingsRepository: { update: settingsUpdate },
          userStatisticsService: { ensureUserActivityStat: activity },
          plansService: { getActualByUserId: async () => ({ plan: null }) },
          subscriptionsService: { syncLegacyPlanToUserPlanState: syncLegacy },
        },
      );
      const module = await Test.createTestingModule({
        imports: [PassportModule.register({})],
        controllers: [UsersController],
        providers: [
          JwtStrategy,
          AdminJwtStrategy,
          { provide: ConfigService, useValue: { get: () => adminSecret } },
          {
            provide: AdminsService,
            useValue: {
              findById: async () => ({
                id: 7,
                role: AdminRole.ADMIN,
                active: true,
              }),
            },
          },
          { provide: UsersService, useValue: users },
          { provide: GeoAccessService, useValue: {} },
        ],
      }).compile();
      app = module.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: false,
          transform: true,
          transformOptions: { enableImplicitConversion: true },
        }),
      );
      await app.listen(0, '127.0.0.1');
    } finally {
      if (previousSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousSecret;
    }
  });

  afterAll(async () => app?.close());

  beforeEach(() => {
    jest.clearAllMocks();
    row = { ...owner, emailVerified: false, isSystem: false };
  });

  it('requires an authenticated app session', async () => {
    await request(app.getHttpServer())
      .patch('/users/update')
      .send({ hash, name: 'After' })
      .expect(401);
    expect(findByUUID).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it.each([269, 275, 276])(
    'preserves build %s name/metadata payloads',
    async (build) => {
      const result = await patch({
        name: 'Олег',
        appVersion: '1.3.39',
        appBuild: String(build),
      }).expect(200);
      expect(result.body.user).toMatchObject({ ...owner, name: 'Олег' });
      expect(update).toHaveBeenCalledWith(owner.id, { name: 'Олег' });
      expect(settingsUpdate).toHaveBeenCalledWith(
        { user: { id: owner.id } },
        { appVersion: '1.3.39', appBuild: build },
      );
    },
  );

  it('preserves the activity timestamp and statistics update', async () => {
    const timestamp = '2026-10-27T05:00:00.000Z';
    await patch({ lastActiveAt: timestamp }).expect(200);
    expect(update).toHaveBeenCalledWith(owner.id, {
      lastActiveAt: new Date(timestamp),
    });
    expect(activity).toHaveBeenCalledWith(owner.id, new Date(timestamp));
  });

  it.each([true, false])(
    'preserves legacy without-subscription choice %s',
    async (value) => {
      await patch({ usesWithoutSubscription: value }).expect(200);
      expect(update).toHaveBeenCalledWith(owner.id, {
        usesWithoutSubscription: value,
      });
      expect(syncLegacy).toHaveBeenCalledWith(owner.id, null);
    },
  );

  it.each([
    ['role', 'admin'],
    ['emailVerified', true],
    ['isSystem', true],
    ['id', 99],
    ['uuid', 'another-user'],
    ['email', 'other@example.com'],
    ['phone', '+10000000000'],
    ['password', 'replacement'],
    ['isRegistered', true],
    ['isLogged', true],
    ['oauthProvider', 'google'],
    ['oauthProviderId', 'other-google'],
    ['subscriptionRuntime', 'v2'],
    ['newEmail', 'other@example.com'],
    ['emailVerificationCode', '123456'],
    ['passwordResetCode', '123456'],
    ['passwordChangeToken', 'token'],
    ['newEmailVerificationCode', '123456'],
    ['phoneVerificationCode', '123456'],
    ['deleteAccountVerificationCode', '123456'],
    ['resetPinVerificationCode', '123456'],
    ['dekEncrypted', 'key'],
    ['dekVersion', 99],
    ['inactivityWarnedAt', null],
    ['scheduledDeletionAt', null],
    ['createdAt', '2020-01-01'],
    ['updatedAt', '2030-01-01'],
    ['acquisitionSource', 'other'],
    ['acquisitionMetaJson', { fake: true }],
    ['regionCode', 'XX'],
    ['plans', [{ actual: true }]],
    ['settings', { id: 99 }],
    ['salt', { value: 'other' }],
    ['sessions', [{ id: 99 }]],
    ['aiPreferences', { userId: 99 }],
    ['futureUnknownColumn', 'blocked'],
  ])('never forwards unsupported field %s', async (field, value) => {
    await patch({ name: 'Allowed', [field]: value }).expect(200);
    expect(findByUUID).toHaveBeenCalledWith(owner.uuid);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(owner.id, {
      name: 'Allowed',
    });
    expect(row).toMatchObject({
      id: owner.id,
      uuid: owner.uuid,
      role: 'user',
      emailVerified: false,
    });
  });

  it('a privileged-only payload performs no database write', async () => {
    await patch({ role: 'admin', emailVerified: true }).expect(200);
    expect(update).not.toHaveBeenCalled();
    expect(settingsUpdate).not.toHaveBeenCalled();
    expect(activity).not.toHaveBeenCalled();
    expect(syncLegacy).not.toHaveBeenCalled();
  });

  it('accepts metadata-only refresh without an empty entity update', async () => {
    await patch({ appVersion: '1.3.39', appBuild: 276 }).expect(200);
    expect(update).not.toHaveBeenCalled();
    expect(settingsUpdate).toHaveBeenCalledTimes(1);
  });

  it.each([
    { hash: undefined },
    { hash: null },
    { hash: 123 },
    { name: null },
    { name: 123 },
    { name: '' },
    { name: 'x'.repeat(256) },
    { lastActiveAt: null },
    { lastActiveAt: 'not-a-date' },
    { lastActiveAt: '2026-02-30' },
    { usesWithoutSubscription: 'false' },
    { usesWithoutSubscription: 1 },
    { usesWithoutSubscription: null },
    { appVersion: null },
    { appVersion: 123 },
    { appVersion: 'x'.repeat(101) },
    { appBuild: null },
    { appBuild: true },
    { appBuild: -1 },
    { appBuild: 'broken' },
    { appBuild: 1.2 },
    { appBuild: 2147483648 },
  ])(
    'rejects invalid allowed values without partial writes: %j',
    async (invalid) => {
      await patch({ name: 'After', ...invalid }).expect(400);
      expect(findByUUID).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      expect(settingsUpdate).not.toHaveBeenCalled();
    },
  );

  it('still verifies the own-account hash before any write', async () => {
    const result = await patch({ name: 'After', hash: 'wrong-hash' });
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(update).not.toHaveBeenCalled();
    expect(settingsUpdate).not.toHaveBeenCalled();
  });

  it('does not bypass hash verification on a metadata-only request', async () => {
    const result = await patch({
      appVersion: '1.3.39',
      appBuild: '276',
      hash: 'wrong-hash',
    });
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(update).not.toHaveBeenCalled();
    expect(settingsUpdate).not.toHaveBeenCalled();
  });

  it('propagates a real repository failure instead of reporting success', async () => {
    update.mockRejectedValueOnce(new Error('synthetic database failure'));
    await patch({
      name: 'After',
      appVersion: '1.3.39',
      appBuild: '276',
    }).expect(500);
    expect(row.name).toBe('Before');
    expect(settingsUpdate).not.toHaveBeenCalled();
  });

  it('ordinary app credentials cannot use the administrative role route', async () => {
    await request(app.getHttpServer())
      .post('/users/change-user-role')
      .auth(token(), { type: 'bearer' })
      .send({ uuid: owner.uuid, hash, role: 'admin' })
      .expect(401);
    expect(update).not.toHaveBeenCalled();
  });

  it('retains the authenticated dashboard role-change route', async () => {
    const adminToken = jwt.sign(
      { id: '7', type: 'admin' },
      { secret: adminSecret, expiresIn: 60 },
    );
    await request(app.getHttpServer())
      .post('/users/change-user-role')
      .auth(adminToken, { type: 'bearer' })
      .send({ uuid: owner.uuid, hash, role: 'admin' })
      .expect(201);
    expect(update).toHaveBeenCalledWith(owner.id, { role: 'admin' });
  });

  it('keeps trusted authentication updates outside the public allowlist', async () => {
    const trusted = {
      email: 'verified@example.com',
      emailVerified: true,
      isLogged: true,
      password: 'synthetic-password-hash',
    };
    await users.update(owner.uuid, { hash, ...trusted });
    expect(update).toHaveBeenCalledWith(owner.id, trusted);
  });
});
