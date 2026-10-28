import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { INestApplication, NotFoundException } from '@nestjs/common';
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
import { GeoAccessService } from '../common/geo-access/geo-access.service';
import { CustomThrottlerGuard } from '../common/guards/custom-throttler.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// All identities, keys, repositories and mail delivery are synthetic. Exercise
// the real HTTP controller and Passport strategy, never a deployed API or DB.
describe('Account deletion HTTP access', () => {
  const secret = 'local-deletion-regression-admin-secret';
  const jwt = new JwtService({ secret });
  let app: INestApplication;
  const deleteUser = jest.fn(async (_id: number) => undefined);
  const findAdmin = jest.fn<AdminsService['findById']>();
  const verify = jest.fn(
    async (_purpose: string, _subject: unknown, _code: string) => ({
      status: 'OK',
    }),
  );
  const findByEmail = jest.fn(async (_email: string) => ({
    id: 41,
    email: 'fixture@example.com',
    settings: { lang: 'en' },
  }));
  const send = jest.fn(async () => undefined);
  const sendCode = jest.fn(async (_email: string) => ({ status: 'SENT' }));

  function token(payload: Record<string, unknown> = {}) {
    return jwt.sign(
      { id: '7', type: 'admin', role: AdminRole.SUPER_ADMIN, ...payload },
      { expiresIn: 60 },
    );
  }

  beforeEach(async () => {
    deleteUser.mockReset().mockResolvedValue(undefined);
    findAdmin.mockReset().mockResolvedValue({
      id: 7,
      role: AdminRole.SUPER_ADMIN,
      active: true,
      email: 'admin@example.com',
    } as never);
    verify.mockReset().mockResolvedValue({ status: 'OK' });
    findByEmail.mockClear();
    send.mockClear();
    sendCode.mockClear();
    // Preserve the real verified-deletion orchestration, stub only boundaries.
    const users = Object.assign(
      Object.create(UsersService.prototype) as UsersService,
      {
        deleteUser,
        findByEmail,
        codeCore: { verify },
        emailsService: { send },
        sendVerificationCodeForDelete: sendCode,
      },
    );
    const module = await Test.createTestingModule({
      imports: [
        PassportModule.register({}),
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
      ],
      controllers: [UsersController],
      providers: [
        AdminJwtStrategy,
        { provide: ConfigService, useValue: { get: () => secret } },
        { provide: AdminsService, useValue: { findById: findAdmin } },
        { provide: UsersService, useValue: users },
        { provide: GeoAccessService, useValue: {} },
        { provide: APP_GUARD, useClass: CustomThrottlerGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.listen(0, '127.0.0.1');
  });

  afterEach(async () => {
    await app?.close();
  });

  it('rejects an unauthenticated request before deleting anything', async () => {
    await request(app.getHttpServer()).delete('/users/41').expect(401);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(findAdmin).not.toHaveBeenCalled();
  });

  it.each(['user', undefined])(
    'rejects a non-admin token type %s even with a matching signature',
    async (type) => {
      await request(app.getHttpServer())
        .delete('/users/41')
        .auth(token({ type }), { type: 'bearer' })
        .expect(401);
      expect(deleteUser).not.toHaveBeenCalled();
    },
  );

  it('rejects a token signed with the ordinary app secret', async () => {
    const appToken = jwt.sign(
      { id: 7, type: 'admin', role: AdminRole.SUPER_ADMIN },
      { secret: 'local-app-secret' },
    );
    await request(app.getHttpServer())
      .delete('/users/41')
      .auth(appToken, { type: 'bearer' })
      .expect(401);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('rejects an expired admin token', async () => {
    const expired = jwt.sign({ id: '7', type: 'admin' }, { expiresIn: -1 });
    await request(app.getHttpServer())
      .delete('/users/41')
      .auth(expired, { type: 'bearer' })
      .expect(401);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('rejects an administrator removed from the database', async () => {
    findAdmin.mockResolvedValue(null);
    await request(app.getHttpServer())
      .delete('/users/41')
      .auth(token(), { type: 'bearer' })
      .expect(401);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('rejects an inactive administrator', async () => {
    findAdmin.mockResolvedValue({
      id: 7,
      role: AdminRole.SUPER_ADMIN,
      active: false,
    } as never);
    await request(app.getHttpServer())
      .delete('/users/41')
      .auth(token(), { type: 'bearer' })
      .expect(403);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('uses the current database role after a superadmin is demoted', async () => {
    findAdmin.mockResolvedValue({
      id: 7,
      role: AdminRole.ADMIN,
      active: true,
    } as never);
    await request(app.getHttpServer())
      .delete('/users/41')
      .auth(token(), { type: 'bearer' })
      .expect(403);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it.each(['bearer', 'cookie'])(
    'allows the active superadmin through %s authentication',
    async (transport) => {
      const call = request(app.getHttpServer()).delete('/users/41');
      if (transport === 'cookie')
        call.set('Cookie', `admin_session=${token()}`);
      else call.auth(token(), { type: 'bearer' });
      await call.expect(200);
      expect(deleteUser).toHaveBeenCalledTimes(1);
      expect(deleteUser).toHaveBeenCalledWith(41);
    },
  );

  it.each(['0', '-1', '1.2', '1e2', 'abc', '9007199254740992'])(
    'rejects invalid target ID %s without calling deletion',
    async (id) => {
      await request(app.getHttpServer())
        .delete(`/users/${id}`)
        .auth(token(), { type: 'bearer' })
        .expect(400);
      expect(deleteUser).not.toHaveBeenCalled();
    },
  );

  it('preserves a missing-target error from the service', async () => {
    deleteUser.mockRejectedValueOnce(new NotFoundException());
    await request(app.getHttpServer())
      .delete('/users/41')
      .auth(token(), { type: 'bearer' })
      .expect(404);
  });

  it('keeps requesting an email deletion code available without login', async () => {
    await request(app.getHttpServer())
      .post('/users/send-verification-code-for-delete')
      .send({ email: 'fixture@example.com' })
      .expect(200);
    expect(sendCode).toHaveBeenCalledWith('fixture@example.com');
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('keeps verified self-deletion available without an admin or app token', async () => {
    await request(app.getHttpServer())
      .post('/users/delete-account-by-verification-code')
      .send({ email: 'fixture@example.com', code: '123456', id: 99 })
      .expect(200, { status: 'OK' });
    expect(verify).toHaveBeenCalledWith(
      'delete_account',
      { email: 'fixture@example.com' },
      '123456',
    );
    expect(deleteUser).toHaveBeenCalledWith(41);
    expect(deleteUser).toHaveBeenCalledTimes(1);
    expect(findAdmin).not.toHaveBeenCalled();
  });

  it.each(['INVALID_CODE', 'EXPIRED_CODE', 'ATTEMPTS_EXCEEDED'])(
    'does not delete when the mail-code verifier returns %s',
    async (status) => {
      verify.mockResolvedValue({ status });
      await request(app.getHttpServer())
        .post('/users/delete-account-by-verification-code')
        .send({ email: 'fixture@example.com', code: '123456' })
        .expect(400);
      expect(findByEmail).not.toHaveBeenCalled();
      expect(deleteUser).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    },
  );

  it('does not delete again when the verifier rejects a consumed code', async () => {
    verify
      .mockResolvedValueOnce({ status: 'OK' })
      .mockResolvedValueOnce({ status: 'EXPIRED_CODE' });
    const body = { email: 'fixture@example.com', code: '123456' };
    await request(app.getHttpServer())
      .post('/users/delete-account-by-verification-code')
      .send(body)
      .expect(200);
    await request(app.getHttpServer())
      .post('/users/delete-account-by-verification-code')
      .send(body)
      .expect(400);
    expect(deleteUser).toHaveBeenCalledTimes(1);
  });
});
