import {
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { JwtService } from '@nestjs/jwt';
import { HttpException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import nacl from 'tweetnacl';
import { SessionsService } from './sessions.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { User } from '../users/entities/user.entity';
import { generateHash } from '../common/utils/generateHash';
import {
  assertCurrentUserAccess,
  userAccessClaims,
} from './user-access-claims';
import { WsAuthGuard } from '../ai/guards/ws-auth.guard';
import { PlanGateway } from '../ai/gateway/plan.gateway';
import { CommunityGateway } from '../forum/gateway/community.gateway';

jest.mock('expo-server-sdk', () => ({ Expo: class {} }));

const secret = 'local-na05-synthetic-secret';
const jwt = new JwtService({ secret });
const oldEnv = process.env.JWT_SECRET;

// Real JWT/bcrypt/device-signature/service flow; isolated transactional store.
// This models serialization and rollback, not a PostgreSQL integration test.
function harness() {
  let user: any = {
    id: 1,
    uuid: 'guest',
    password: null,
    email: null,
    hash: generateHash('guest', 'synthetic-salt'),
    name: 'Guest',
    isRegistered: false,
  };
  let rows: any[] = [];
  let tail = Promise.resolve();
  let failDelete = false;
  const lockOrder: string[] = [];
  const userRepo = {
    findOne: async () => {
      lockOrder.push('user');
      return { ...user };
    },
    update: async (_where: any, patch: any) => {
      Object.assign(user, patch);
    },
  };
  const sessionRepo = {
    findOne: async ({ where }: any) => {
      lockOrder.push('session');
      const row = rows.find(
        (r) => r.userId === where.userId && r.deviceId === where.deviceId,
      );
      return row ? structuredClone(row) : null;
    },
    create: (row: any) => row,
    save: async (row: any) => {
      rows = [
        ...rows.filter((r) => r.deviceId !== row.deviceId),
        structuredClone(row),
      ];
    },
    delete: async () => {
      if (failDelete) throw new Error('synthetic delete failure');
      rows = [];
    },
  };
  const manager = {
    getRepository: (entity: any) => (entity === User ? userRepo : sessionRepo),
  };
  const transaction = (run: (m: any) => Promise<any>) => {
    const pending = tail.then(async () => {
      const snapshot = structuredClone({ user, rows });
      try {
        return await run(manager);
      } catch (error) {
        user = snapshot.user;
        rows = snapshot.rows;
        throw error;
      }
    });
    tail = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  };
  const users: any = {
    findById: async (id: number) => (id === user.id ? { ...user } : null),
    findByUUID: async (uuid: string) =>
      uuid === user.uuid ? { ...user } : null,
    findByEmail: async (email: string) =>
      email === user.email ? { ...user } : null,
    update: async (_uuid: string, patch: any) => {
      Object.assign(user, patch);
      return { user: { ...user } };
    },
    getUserSettings: async () => ({ theme: 'dark' }),
  };
  const config: any = {
    get: (key: string) => (key === 'JWT_SECRET' ? secret : undefined),
  };
  const codes: any = { verify: jest.fn(async () => ({ status: 'OK' })) };
  const sessions = new SessionsService(
    jwt,
    { manager: { transaction } } as any,
    config,
    users,
    { getSaltByUserId: async () => ({ value: 'synthetic-salt' }) } as any,
  );
  const auth = new AuthService(
    {} as any,
    users,
    {} as any,
    {} as any,
    config,
    jwt,
    {} as any,
    {} as any,
    codes,
    { getActualByUserId: async () => ({ plan: { id: 9 } }) } as any,
    sessions,
    { getForUser: async () => ({}) } as any,
  );
  const strategy = new JwtStrategy(users);
  const validate = (token: string) => strategy.validate(jwt.verify(token));
  return {
    sessions,
    auth,
    users,
    codes,
    validate,
    lockOrder,
    get user() {
      return user;
    },
    get rows() {
      return rows;
    },
    failDelete() {
      failDelete = true;
    },
  };
}

const signature = (body: object, keys: nacl.SignKeyPair) =>
  Buffer.from(
    nacl.sign.detached(Buffer.from(JSON.stringify(body)), keys.secretKey),
  ).toString('base64');

describe('NA-05 session credentials and released-client compatibility', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = secret;
  });
  afterEach(() => {
    if (oldEnv === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldEnv;
  });

  it('refuses the legacy endpoint even with genuine uuid/hash from an expired signed JWT', async () => {
    const h = harness();
    const legacy = jwt.decode(jwt.sign(h.user, { expiresIn: -1 }));
    const controller = new AuthController(h.auth);
    await expect(
      controller.createToken({ uuid: legacy.uuid, hash: legacy.hash }),
    ).rejects.toBeInstanceOf(HttpException);
    expect(h.rows).toHaveLength(0);
  });

  it('issues minimal JWTs without password, hash, private profile fields or plan relations', async () => {
    const h = harness();
    h.user.passwordResetCode = 'private-code';
    h.user.plans = [{ id: 9 }];
    const pair = await h.sessions.issueTokens(h.user, 'old-device');
    const payload = jwt.verify(pair.accessToken);
    expect(Object.keys(payload).sort()).toEqual([
      'credentialVersion',
      'exp',
      'iat',
      'id',
      'uuid',
    ]);
    expect(await h.validate(pair.accessToken)).toMatchObject({
      id: 1,
      uuid: 'guest',
    });
  });

  it('accepts pre-deploy full JWTs and legacy unsigned refresh without logging a user out on deploy', async () => {
    const h = harness();
    h.user.password = await bcrypt.hash('Old1!password', 4);
    h.user.email = 'user@example.test';
    const oldAccess = jwt.sign(h.user);
    const pair = await h.sessions.issueTokens(h.user, 'old-device');
    expect(await h.validate(oldAccess)).toMatchObject({ id: 1 });
    const next = await h.sessions.refresh(
      1,
      'old-device',
      pair.refreshToken,
      Date.now(),
      '',
    );
    expect(await h.validate(next.accessToken)).toMatchObject({ id: 1 });
    expect(next).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      deviceId: 'old-device',
    });
  });

  it('resets by valid email code, revokes old/new JWTs and all devices, then permits the new password login', async () => {
    const h = harness();
    Object.assign(h.user, {
      password: await bcrypt.hash('Old1!password', 4),
      email: 'user@example.test',
      emailVerified: true,
      isRegistered: true,
    });
    const oldAccess = jwt.sign(h.user);
    const first = await h.sessions.issueTokens(h.user, 'device-1');
    const second = await h.sessions.issueTokens(h.user, 'device-2');
    const staleUser = { ...h.user };
    await expect(
      h.auth.changePassword({
        email: h.user.email,
        code: '123456',
        password: 'New1!password',
      }),
    ).resolves.toMatchObject({ status: 'OK' });
    expect(h.rows).toHaveLength(0);
    for (const token of [oldAccess, first.accessToken, second.accessToken])
      await expect(h.validate(token)).rejects.toBeInstanceOf(HttpException);
    await expect(
      h.sessions.refresh(1, 'device-1', first.refreshToken, Date.now(), ''),
    ).rejects.toBeInstanceOf(HttpException);
    await expect(
      h.sessions.issueTokens(staleUser, 'late-login'),
    ).rejects.toBeInstanceOf(HttpException);
    await expect(
      h.auth.login({
        email: h.user.email,
        password: 'Old1!password',
        uuid: h.user.uuid,
      } as any),
    ).rejects.toBeInstanceOf(HttpException);
    const result = await h.auth.login({
      email: h.user.email,
      password: 'New1!password',
      uuid: h.user.uuid,
      deviceId: 'device-1',
    } as any);
    expect(await h.validate(result.accessToken)).toMatchObject({ id: 1 });
    expect(result).toMatchObject({
      user: { id: 1 },
      plan: { id: 9 },
      settings: { theme: 'dark' },
    });
  });

  it('invalid OTP leaves password and sessions unchanged', async () => {
    const h = harness();
    const pair = await h.sessions.issueTokens(h.user, 'device');
    h.codes.verify.mockResolvedValue({ status: 'INVALID_CODE' });
    await expect(
      h.auth.changePassword({ email: 'x', code: 'bad', password: 'new' }),
    ).rejects.toBeInstanceOf(HttpException);
    expect(h.rows).toHaveLength(1);
    expect(h.user.password).toBeNull();
    expect(await h.validate(pair.accessToken)).toMatchObject({ id: 1 });
  });

  it('does not let an old guest JWT rewrite registration after credentials changed', async () => {
    const h = harness();
    const legacy = jwt.sign(h.user);
    const current = jwt.sign(userAccessClaims(h.user, secret));
    await h.sessions.resetPasswordAndRevokeSessions(1, 'changed-credentials');
    for (const token of [legacy, current]) {
      await expect(
        h.auth.register(
          {
            uuid: h.user.uuid,
            email: 'test@example.test',
            password: 'New1!password',
          } as any,
          `Bearer ${token}`,
        ),
      ).rejects.toBeInstanceOf(HttpException);
    }
    expect(h.user.password).toBe('changed-credentials');
    expect(h.rows).toHaveLength(0);
  });

  it('rejects a password login whose account was reset after password verification', async () => {
    const h = harness();
    Object.assign(h.user, {
      password: await bcrypt.hash('Old1!password', 4),
      email: 'user@example.test',
      emailVerified: true,
    });
    const update = h.users.update;
    h.users.update = async (...args: any[]) => {
      await h.sessions.resetPasswordAndRevokeSessions(1, 'reset-during-login');
      return update(...args);
    };
    await expect(
      h.auth.login({
        email: h.user.email,
        password: 'Old1!password',
        uuid: h.user.uuid,
        deviceId: 'late-login',
      } as any),
    ).rejects.toBeInstanceOf(HttpException);
    expect(h.rows).toHaveLength(0);
  });

  it.each(['malformed', 'stale', 'missing-time'])(
    'rejects invalid guest device proof (%s) as an auth error',
    async (scenario) => {
      const h = harness();
      const keys = nacl.sign.keyPair();
      const key = Buffer.from(keys.publicKey).toString('base64');
      await h.sessions.issueTokens(h.user, 'device', key);
      const body = {
        userId: 1,
        deviceId: 'device',
        uuid: h.user.uuid,
        hash: h.user.hash,
        ts:
          scenario === 'stale'
            ? Date.now() - 300000
            : scenario === 'missing-time'
              ? NaN
              : Date.now(),
      };
      const sig = scenario === 'malformed' ? 'bad' : signature(body, keys);
      const before = structuredClone(h.rows);
      await expect(
        h.sessions.recoverAnon(
          1,
          body.uuid,
          body.hash,
          'device',
          body.ts,
          sig,
          key,
        ),
      ).rejects.toBeInstanceOf(HttpException);
      expect(h.rows).toEqual(before);
    },
  );

  it('rolls back the password if session deletion fails', async () => {
    const h = harness();
    const pair = await h.sessions.issueTokens(h.user, 'device');
    h.failDelete();
    await expect(
      h.sessions.resetPasswordAndRevokeSessions(1, 'new-hash'),
    ).rejects.toThrow('synthetic delete failure');
    expect(h.user.password).toBeNull();
    expect(h.rows).toHaveLength(1);
    expect(await h.validate(pair.accessToken)).toMatchObject({ id: 1 });
  });

  it.each(['refresh-first', 'reset-first'])(
    'serializes reset against refresh (%s)',
    async (order) => {
      const h = harness();
      const pair = await h.sessions.issueTokens(h.user, 'device');
      const refresh = () =>
        h.sessions.refresh(1, 'device', pair.refreshToken, Date.now(), '');
      const reset = () =>
        h.sessions.resetPasswordAndRevokeSessions(1, 'changed-hash');
      const results = await Promise.allSettled(
        order === 'refresh-first' ? [refresh(), reset()] : [reset(), refresh()],
      );
      expect(h.rows).toHaveLength(0);
      const result = results[order === 'refresh-first' ? 0 : 1];
      if (result.status === 'fulfilled' && result.value)
        await expect(
          h.validate(result.value.accessToken),
        ).rejects.toBeInstanceOf(HttpException);
      else {
        expect(result.status).toBe('rejected');
      }
      expect(h.lockOrder[0]).toBe('user');
    },
  );

  it('recovers the existing guest with its device signature, including old request body', async () => {
    const h = harness();
    const keys = nacl.sign.keyPair();
    const key = Buffer.from(keys.publicKey).toString('base64');
    await h.sessions.issueTokens(h.user, 'device', key);
    const body = {
      userId: 1,
      deviceId: 'device',
      uuid: h.user.uuid,
      hash: h.user.hash,
      ts: Date.now(),
    };
    const pair = await h.sessions.recoverAnon(
      1,
      body.uuid,
      body.hash,
      'device',
      body.ts,
      signature(body, keys),
      key,
    );
    expect(await h.validate(pair.accessToken)).toMatchObject({ id: 1 });
    expect(h.rows).toHaveLength(1);
  });

  it.each(['missing-session', 'missing-bound-key', 'wrong-key', 'registered'])(
    'blocks uuid/hash recovery bypass: %s',
    async (scenario) => {
      const h = harness();
      const original = nacl.sign.keyPair();
      const attacker = nacl.sign.keyPair();
      const key = Buffer.from(attacker.publicKey).toString('base64');
      if (scenario !== 'missing-session')
        await h.sessions.issueTokens(
          h.user,
          'device',
          scenario === 'missing-bound-key'
            ? null
            : Buffer.from(original.publicKey).toString('base64'),
        );
      if (scenario === 'registered') h.user.isRegistered = true;
      const before = structuredClone(h.rows);
      const body = {
        userId: 1,
        deviceId: 'device',
        uuid: h.user.uuid,
        hash: h.user.hash,
        ts: Date.now(),
      };
      await expect(
        h.sessions.recoverAnon(
          1,
          body.uuid,
          body.hash,
          'device',
          body.ts,
          signature(body, attacker),
          key,
        ),
      ).rejects.toBeInstanceOf(HttpException);
      expect(h.rows).toEqual(before);
    },
  );

  it('does not expose the credential fingerprint as a password or recovery credential', () => {
    const h = harness();
    const claims = userAccessClaims(h.user, secret);
    expect(() =>
      assertCurrentUserAccess(
        { ...claims, credentialVersion: 'bad' },
        h.user,
        secret,
      ),
    ).toThrow();
    expect(() =>
      assertCurrentUserAccess({ ...claims, id: 2 }, h.user, secret),
    ).toThrow();
    expect(() => assertCurrentUserAccess(claims, null, secret)).toThrow();
  });

  it('rejects revoked JWT on existing socket messages and new plan/community connections', async () => {
    const h = harness();
    const pair = await h.sessions.issueTokens(h.user, 'device');
    const client: any = {
      handshake: { auth: { token: pair.accessToken } },
      emit: jest.fn(),
      disconnect: jest.fn(),
      join: jest.fn(),
    };
    const context: any = { switchToWs: () => ({ getClient: () => client }) };
    const guard = new WsAuthGuard(jwt, h.users);
    expect(await guard.canActivate(context)).toBe(true);
    await h.sessions.resetPasswordAndRevokeSessions(1, 'new-hash');
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      HttpException,
    );
    for (const Gateway of [PlanGateway, CommunityGateway]) {
      client.join.mockClear();
      client.disconnect.mockClear();
      await new Gateway(jwt, h.users).handleConnection(client);
      expect(client.disconnect).toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
    }
  });
});
