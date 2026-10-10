import { HttpException } from '@nestjs/common';
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { bcryptHashToken, bcryptVerifyToken } from 'src/common/utils/bctypto';
import { User } from 'src/users/entities/user.entity';
import { UserSession } from './entities/user-session.entity';
import { SessionsService } from './sessions.service';
import nacl from 'tweetnacl';

jest.mock('src/common/utils/bctypto', () => ({
  bcryptHashToken: jest.fn(async (token: string) => `hash:${token}`),
  bcryptVerifyToken: jest.fn(
    async (token: string, hash: string) => hash === `hash:${token}`,
  ),
}));

describe('SessionsService refresh rotation', () => {
  const user = { id: 42, email: 'user@example.com' } as User;
  const session = {
    id: 7,
    user,
    userId: user.id,
    deviceId: 'device-1',
    refreshTokenHash: 'hash:refresh-0',
    refreshTokenHistory: [],
    devicePubKey: null,
    deviceKeyAlg: 'ed25519',
    userAgent: null,
    ip: null,
    createdAt: new Date(),
    lastUsedAt: new Date(),
  } as UserSession;

  const sessionsRepository = {
    findOne: jest.fn(async () => session),
    save: jest.fn(async (value: UserSession) => value),
  };
  const usersRepository = {
    findOneBy: jest.fn(async () => user),
  };
  const transactionManager = {
    getRepository: jest.fn((entity: typeof UserSession | typeof User) =>
      entity === UserSession ? sessionsRepository : usersRepository,
    ),
  };
  const rootRepository = {
    manager: {
      transaction: jest.fn(
        async (callback: (manager: typeof transactionManager) => unknown) =>
          callback(transactionManager),
      ),
    },
  };
  const jwtService = {
    signAsync: jest.fn(async () => 'access-token'),
  };
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'JWT_ACCESS_TOKEN_TTL') return 604800;
      if (key === 'JWT_REFRESH_TOKEN_GRACE_MS') return 60_000;
      return undefined;
    }),
  };

  let service: SessionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    session.refreshTokenHash = 'hash:refresh-0';
    session.refreshTokenHistory = [];
    session.userAgent = null;
    session.ip = null;
    session.devicePubKey = null;

    service = new SessionsService(
      jwtService as any,
      rootRepository as any,
      configService as any,
      {} as any,
      {} as any,
    );
  });

  it('locks the session and keeps the previous refresh token valid during rotation', async () => {
    const timestamp = Date.now();
    const first = await service.refresh(
      user.id,
      session.deviceId,
      'refresh-0',
      timestamp,
      '',
      'test-agent',
      '127.0.0.1',
    );

    expect(first.accessToken).toBe('access-token');
    expect(first.refreshToken).toBeTruthy();
    expect(sessionsRepository.findOne).toHaveBeenCalledWith({
      where: { userId: user.id, deviceId: session.deviceId },
      lock: { mode: 'pessimistic_write' },
    });
    expect(session.refreshTokenHistory).toEqual([
      expect.objectContaining({ hash: 'hash:refresh-0' }),
    ]);
    expect(session.userAgent).toBe('test-agent');
    expect(session.ip).toBe('127.0.0.1');
  });

  it('serializes login/recovery issuance with refresh and invalidates the old session credentials', async () => {
    session.refreshTokenHistory = [
      { hash: 'hash:old', validUntil: Date.now() + 10000 },
    ];
    await service.issueTokens(user, session.deviceId);
    expect(sessionsRepository.findOne).toHaveBeenCalledWith({
      where: { userId: user.id, deviceId: session.deviceId },
      lock: { mode: 'pessimistic_write' },
    });
    expect(session.refreshTokenHistory).toEqual([]);
    await expect(
      service.refresh(user.id, session.deviceId, 'refresh-0', Date.now(), ''),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('rejects changing a signed rotation proposal or replaying an expired signature', async () => {
    const keys = nacl.sign.keyPair();
    session.devicePubKey = Buffer.from(keys.publicKey).toString('base64');
    const ts = Date.now();
    const body = {
      userId: user.id,
      deviceId: session.deviceId,
      refreshToken: 'refresh-0',
      ts,
      nextRefreshToken: 'ab'.repeat(32),
    };
    const sig = Buffer.from(
      nacl.sign.detached(Buffer.from(JSON.stringify(body)), keys.secretKey),
    ).toString('base64');
    await expect(
      service.refresh(
        user.id,
        session.deviceId,
        'refresh-0',
        ts,
        sig,
        null,
        null,
        'cd'.repeat(32),
      ),
    ).rejects.toBeInstanceOf(HttpException);
    await expect(
      service.refresh(
        user.id,
        session.deviceId,
        'refresh-0',
        ts - 180000,
        sig,
        null,
        null,
        body.nextRefreshToken,
      ),
    ).rejects.toBeInstanceOf(HttpException);
    expect(sessionsRepository.save).not.toHaveBeenCalled();
  });

  it('accepts the same stale token from a concurrent refresh request', async () => {
    const timestamp = Date.now();
    await service.refresh(
      user.id,
      session.deviceId,
      'refresh-0',
      timestamp,
      '',
    );

    await expect(
      service.refresh(user.id, session.deviceId, 'refresh-0', timestamp, ''),
    ).resolves.toEqual(
      expect.objectContaining({
        accessToken: 'access-token',
        deviceId: session.deviceId,
      }),
    );
    expect(sessionsRepository.save).toHaveBeenCalledTimes(2);
    expect(jest.mocked(bcryptVerifyToken)).toHaveBeenCalledWith(
      'refresh-0',
      'hash:refresh-0',
    );
  });

  it('rejects an expired historical refresh token', async () => {
    session.refreshTokenHash = 'hash:refresh-current';
    session.refreshTokenHistory = [
      { hash: 'hash:refresh-old', validUntil: Date.now() - 1 },
    ];

    try {
      await service.refresh(
        user.id,
        session.deviceId,
        'refresh-old',
        Date.now(),
        '',
      );
      throw new Error('Expected refresh to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getResponse()).toEqual(
        expect.objectContaining({ code: 'INVALID_REFRESH_TOKEN' }),
      );
    }
    expect(jest.mocked(bcryptHashToken)).not.toHaveBeenCalled();
    expect(sessionsRepository.save).not.toHaveBeenCalled();
  });

  const nextToken = 'ab'.repeat(32);
  function signedRefresh(
    token: string,
    next: string,
    keys: nacl.SignKeyPair,
    ts = Date.now(),
  ) {
    const payload = {
      userId: user.id,
      deviceId: session.deviceId,
      refreshToken: token,
      ts,
      nextRefreshToken: next,
    };
    const signature = Buffer.from(
      nacl.sign.detached(Buffer.from(JSON.stringify(payload)), keys.secretKey),
    ).toString('base64');
    return service.refresh(
      user.id,
      session.deviceId,
      token,
      ts,
      signature,
      null,
      null,
      next,
    );
  }

  it('recovers after a lost response beyond the old-token grace period using the durable candidate', async () => {
    const keys = nacl.sign.keyPair();
    session.devicePubKey = Buffer.from(keys.publicKey).toString('base64');
    // Server commits, but the client never receives this response.
    await signedRefresh('refresh-0', nextToken, keys);
    session.refreshTokenHistory.forEach((entry) => {
      entry.validUntil = Date.now() - 1;
    });
    await expect(
      signedRefresh('refresh-0', nextToken, keys),
    ).rejects.toBeInstanceOf(HttpException);
    await expect(signedRefresh(nextToken, nextToken, keys)).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: nextToken,
      deviceId: session.deviceId,
    });
    expect(session.refreshTokenHash).toBe(`hash:${nextToken}`);
  });

  it('binds the replacement to the device signature and rejects another key', async () => {
    const keys = nacl.sign.keyPair();
    session.devicePubKey = Buffer.from(keys.publicKey).toString('base64');
    await expect(
      signedRefresh('refresh-0', nextToken, nacl.sign.keyPair()),
    ).rejects.toBeInstanceOf(HttpException);
    expect(sessionsRepository.save).not.toHaveBeenCalled();
    expect(session.refreshTokenHash).toBe('hash:refresh-0');
  });

  it('does not let a signed proposal bypass an invalid current token', async () => {
    const keys = nacl.sign.keyPair();
    session.devicePubKey = Buffer.from(keys.publicKey).toString('base64');
    await expect(
      signedRefresh('revoked-token', nextToken, keys),
    ).rejects.toBeInstanceOf(HttpException);
    expect(sessionsRepository.save).not.toHaveBeenCalled();
  });

  it('rejects proposals on unsigned legacy sessions and leaves legacy refresh available', async () => {
    await expect(
      signedRefresh('refresh-0', nextToken, nacl.sign.keyPair()),
    ).rejects.toBeInstanceOf(HttpException);
    expect(sessionsRepository.save).not.toHaveBeenCalled();
    await expect(
      service.refresh(user.id, session.deviceId, 'refresh-0', Date.now(), ''),
    ).resolves.toBeTruthy();
  });
});
