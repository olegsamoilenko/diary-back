import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any) {
    if (info) {
      console.log('[JWT] info:', info?.name, info?.message);
    }
    if (err) {
      console.log('[JWT] err:', err);
      throw err;
    }
    if (!user) {
      throw new UnauthorizedException(info?.message ?? 'Unauthorized');
    }
    return user;
  }
}
