import { UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { User } from '../users/entities/user.entity';

type Identity = Pick<User, 'id' | 'uuid' | 'password'>;
export type UserAccessClaims = {
  id: number;
  uuid: string;
  credentialVersion?: string;
  password?: string | null; // Read-only compatibility with already issued JWTs.
};

function credentialVersion(user: Identity, secret: string) {
  if (!secret) throw new Error('JWT_SECRET is not set');
  return createHmac('sha256', secret)
    .update(
      JSON.stringify([
        'user-access-v1',
        user.id,
        user.uuid,
        user.password ?? null,
      ]),
    )
    .digest('hex');
}

export function userAccessClaims(
  user: Identity,
  secret: string,
): UserAccessClaims {
  return {
    id: user.id,
    uuid: user.uuid,
    credentialVersion: credentialVersion(user, secret),
  };
}

export function assertCurrentUserAccess(
  payload: UserAccessClaims,
  user: Identity | null,
  secret: string,
): asserts user is Identity {
  if (
    !user ||
    !Number.isSafeInteger(payload.id) ||
    payload.id <= 0 ||
    payload.id !== user.id ||
    payload.uuid !== user.uuid
  ) {
    throw new UnauthorizedException('Invalid user session');
  }
  if (payload.credentialVersion !== undefined) {
    const expected = credentialVersion(user, secret);
    const actual = payload.credentialVersion;
    if (
      typeof actual !== 'string' ||
      !/^[a-f0-9]{64}$/.test(actual) ||
      !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
    ) {
      throw new UnauthorizedException('User credentials changed');
    }
  } else if ((payload.password ?? null) !== (user.password ?? null)) {
    // Old tokens contained the password hash. Compare it server-side only;
    // new tokens never expose it. Reset invalidates both formats immediately.
    throw new UnauthorizedException('User credentials changed');
  }
}
