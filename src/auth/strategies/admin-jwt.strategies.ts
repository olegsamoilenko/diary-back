import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

type AdminJwtPayload = {
  id: string;
  email: string;
  role: string;
  type: 'admin';
  active: boolean;
  iat?: number;
  exp?: number;
};

const adminCookieExtractor = (req: Request): string | null => {
  const cookiesUnknown: unknown = (req as unknown as { cookies?: unknown })
    .cookies;
  if (!cookiesUnknown || typeof cookiesUnknown !== 'object') return null;

  const token = (cookiesUnknown as Record<string, unknown>)['admin_session'];
  return typeof token === 'string' ? token : null;
};

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(config: ConfigService) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET is not set');

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        adminCookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      secretOrKey: secret,
      ignoreExpiration: false,
    });
  }

  validate(payload: AdminJwtPayload): AdminJwtPayload {
    if (payload?.type !== 'admin') throw new UnauthorizedException();
    if (payload?.active === false)
      throw new ForbiddenException('Admin inactive');
    return payload;
  }
}
