import { HttpException } from '@nestjs/common';
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { bcryptHashToken, bcryptVerifyToken } from 'src/common/utils/bctypto';
import { User } from 'src/users/entities/user.entity';
import { UserSession } from './entities/user-session.entity';
import { SessionsService } from './sessions.service';

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
});
