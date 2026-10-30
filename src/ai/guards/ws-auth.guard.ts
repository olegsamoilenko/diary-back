import { Inject, forwardRef } from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import { assertCurrentUserAccess } from 'src/auth/user-access-claims';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { throwError } from '../../common/utils';
import { HttpStatus } from '../../common/utils/http-status';
import { AuthenticatedSocket, SocketAuthPayload } from '../types';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class WsAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<AuthenticatedSocket>();
    const { token } = client.handshake.auth as SocketAuthPayload;
    if (!token) {
      client.emit('unauthorized_error', {
        statusMessage: 'tokenRequired',
        message: 'tokenIsRequiredForAuthentication',
      });
      client.disconnect();
      throwError(
        HttpStatus.UNAUTHORIZED,
        'tokenRequired',
        'tokenIsRequiredForAuthentication',
        'TOKEN_REQUIRED',
      );
      return false;
    }
    try {
      const payload = this.jwtService.verify<User>(token);
      const currentUser =
        Number.isSafeInteger(payload.id) && payload.id > 0
          ? await this.usersService.findById(payload.id)
          : null;
      assertCurrentUserAccess(
        payload,
        currentUser,
        process.env.JWT_SECRET ?? '',
      );
      client.user = payload;
      return true;
    } catch {
      client.emit('unauthorized_error', {
        statusMessage: 'invalidToken',
        message: 'invalidTokenProvided',
      });
      client.disconnect();
      throwError(
        HttpStatus.UNAUTHORIZED,
        'invalidToken',
        'invalidTokenProvided',
        'INVALID_TOKEN',
      );
      return false;
    }
  }
}
