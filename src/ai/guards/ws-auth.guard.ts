import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { throwError } from '../../common/utils';
import { HttpStatus } from '../../common/utils/http-status';
import { AuthenticatedSocket, SocketAuthPayload } from '../types';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class WsAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const client = context.switchToWs().getClient<AuthenticatedSocket>();
    const { token } = client.handshake.auth as SocketAuthPayload;
    console.log('WsAuthGuard', token);
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
      client.user = payload;
      console.log('WsAuthGuard2', payload);
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
