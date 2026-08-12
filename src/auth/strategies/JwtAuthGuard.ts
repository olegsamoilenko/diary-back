import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(
    err: unknown,
    user: unknown,
    info: unknown,
  ): TUser {
    if (err) {
      throw err instanceof Error ? err : new UnauthorizedException();
    }
    if (!user) {
      const message =
        info && typeof info === 'object' && 'message' in info
          ? (info as { message?: unknown }).message
          : null;
      throw new UnauthorizedException(
        typeof message === 'string' ? message : 'Unauthorized',
      );
    }
    return user as TUser;
  }
}
