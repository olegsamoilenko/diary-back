import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { Logger } from '@nestjs/common';
import { authenticateSocket } from './socket-auth';
import { userAccessClaims } from './user-access-claims';

describe('shared socket authentication', () => {
  const oldSecret = process.env.JWT_SECRET;
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-socket-secret';
  });
  afterAll(() => {
    process.env.JWT_SECRET = oldSecret;
  });
  const harness = (id = 1) => {
    const user = { id, uuid: 'test-user-' + id, password: null };
    const jwt = {
      verify: jest.fn(() =>
        userAccessClaims(user as any, process.env.JWT_SECRET!),
      ),
    };
    const users = { findById: jest.fn(async () => user) };
    const client: any = {
      handshake: { auth: { token: 'test-token' } },
      emit: jest.fn(),
      disconnect: jest.fn(),
    };
    return { client, jwt, users };
  };
  it('validates the shared physical connection once and emits ready once', async () => {
    const { client, jwt, users } = harness();
    await Promise.all(
      [1, 2, 3].map(() => authenticateSocket(client, jwt as any, users as any)),
    );
    expect(jwt.verify).toHaveBeenCalledTimes(1);
    expect(users.findById).toHaveBeenCalledTimes(1);
    expect(client.emit.mock.calls.map(([name]: any[]) => name)).toEqual([
      'socket_auth_pending',
      'socket_auth_ready',
    ]);
    expect(client.disconnect).not.toHaveBeenCalled();
  });
  it('accepts simultaneous users and keeps each identity on its own socket', async () => {
    const clients = [harness(1), harness(2)];
    await Promise.all(
      clients.map(({ client, jwt, users }) =>
        authenticateSocket(client, jwt as any, users as any),
      ),
    );
    expect(clients.map(({ client }) => client.user.id)).toEqual([1, 2]);
    for (const { client } of clients) {
      expect(client.emit).toHaveBeenCalledWith('socket_auth_ready');
      expect(client.disconnect).not.toHaveBeenCalled();
    }
  });
  it.each(['TokenExpiredError', 'JsonWebTokenError'])(
    'reports %s with a stable code, preserving old-client fields',
    async (name) => {
      const { client, jwt, users } = harness();
      jwt.verify.mockImplementation(() => {
        throw Object.assign(new Error('sensitive token detail'), { name });
      });
      await Promise.all(
        [1, 2].map(() => authenticateSocket(client, jwt as any, users as any)),
      );
      expect(client.emit).toHaveBeenCalledWith('unauthorized_error', {
        code:
          name === 'TokenExpiredError'
            ? 'AUTH_TOKEN_EXPIRED'
            : 'AUTH_TOKEN_INVALID',
        retryable: false,
        statusMessage: 'invalidToken',
        message: 'invalidTokenProvided',
      });
      expect(client.disconnect).toHaveBeenCalledTimes(1);
      expect(users.findById).not.toHaveBeenCalled();
      expect(JSON.stringify(client.emit.mock.calls)).not.toContain('sensitive');
    },
  );
  it('distinguishes an unavailable DB from invalid credentials', async () => {
    const { client, jwt, users } = harness();
    users.findById.mockRejectedValueOnce(new Error('database unavailable'));
    const logger = jest.spyOn(Logger, 'error').mockImplementation(() => {});
    try {
      await authenticateSocket(client, jwt as any, users as any);
      expect(client.emit).toHaveBeenCalledWith(
        'unauthorized_error',
        expect.objectContaining({
          code: 'AUTH_BACKEND_UNAVAILABLE',
          retryable: true,
        }),
      );
      expect(logger).toHaveBeenCalled();
    } finally {
      logger.mockRestore();
    }
  });
  it('rejects removed/revoked identities and never emits ready', async () => {
    const { client, jwt, users } = harness();
    users.findById.mockResolvedValueOnce(null as any);
    await authenticateSocket(client, jwt as any, users as any);
    expect(client.emit).toHaveBeenCalledWith(
      'unauthorized_error',
      expect.objectContaining({ code: 'AUTH_SESSION_REVOKED' }),
    );
    expect(client.emit).not.toHaveBeenCalledWith('socket_auth_ready');
  });
});
