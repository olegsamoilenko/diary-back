import { Logger, UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { UsersService } from '../users/users.service';
import type { User } from '../users/entities/user.entity';
import type { AuthenticatedSocket } from '../ai/types';
import { assertCurrentUserAccess } from './user-access-claims';

// The AI, plan and community gateways share one namespace/connection. Validate
// it once so they cannot emit three errors or race authentication decisions.
const checks = new WeakMap<AuthenticatedSocket, Promise<User | null>>();

export function authenticateSocket(
  client: AuthenticatedSocket,
  jwt: JwtService,
  users: UsersService,
): Promise<User | null> {
  const existing = checks.get(client);
  if (existing) return existing;
  client.emit('socket_auth_pending');
  const reject = (code: string, retryable = false) => {
    client.emit('unauthorized_error', {
      code,
      retryable,
      statusMessage:
        code === 'AUTH_TOKEN_REQUIRED' ? 'tokenRequired' : 'invalidToken',
      message:
        code === 'AUTH_TOKEN_REQUIRED'
          ? 'tokenIsRequiredForAuthentication'
          : 'invalidTokenProvided',
    });
    client.disconnect();
    return null;
  };
  const check = (async () => {
    const token: unknown = client.handshake.auth?.token;
    if (!token) return reject('AUTH_TOKEN_REQUIRED');
    if (typeof token !== 'string') return reject('AUTH_TOKEN_INVALID');
    let payload: User;
    try {
      payload = jwt.verify<User>(token);
    } catch (error) {
      return reject(
        error instanceof Error && error.name === 'TokenExpiredError'
          ? 'AUTH_TOKEN_EXPIRED'
          : 'AUTH_TOKEN_INVALID',
      );
    }
    if (
      !payload ||
      !Number.isSafeInteger(payload.id) ||
      payload.id <= 0 ||
      typeof payload.uuid !== 'string'
    )
      return reject('AUTH_TOKEN_INVALID');
    let user: User | null;
    try {
      user =
        Number.isSafeInteger(payload.id) && payload.id > 0
          ? await users.findById(payload.id)
          : null;
      assertCurrentUserAccess(payload, user, process.env.JWT_SECRET ?? '');
    } catch (error) {
      if (error instanceof UnauthorizedException)
        return reject('AUTH_SESSION_REVOKED');
      Logger.error(
        'Socket authentication backend unavailable',
        error instanceof Error ? error.stack : undefined,
        'SocketAuth',
      );
      return reject('AUTH_BACKEND_UNAVAILABLE', true);
    }
    client.user = payload;
    client.emit('socket_auth_ready');
    return payload;
  })();
  checks.set(client, check);
  return check;
}
