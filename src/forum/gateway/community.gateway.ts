import { Inject, forwardRef } from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import { assertCurrentUserAccess } from 'src/auth/user-access-claims';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server } from 'socket.io';
import { User } from 'src/users/entities/user.entity';
import { AuthenticatedSocket, SocketAuthPayload } from 'src/ai/types';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class CommunityGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const { token } = client.handshake.auth as SocketAuthPayload;

      if (!token) {
        client.emit('unauthorized_error', {
          statusMessage: 'tokenRequired',
          message: 'tokenIsRequiredForAuthentication',
        });
        client.disconnect();
        return;
      }

      const user = this.jwtService.verify<User>(token);
      const currentUser =
        Number.isSafeInteger(user.id) && user.id > 0
          ? await this.usersService.findById(user.id)
          : null;
      assertCurrentUserAccess(user, currentUser, process.env.JWT_SECRET ?? '');
      client.user = user;

      const userId = Number(user?.id);

      if (!userId) {
        client.emit('unauthorized_error', {
          statusMessage: 'invalidUserID',
          message: 'invalidUserID',
        });
        client.disconnect();
        return;
      }

      void client.join('community');
      void client.join(`community:user:${userId}`);
    } catch (e) {
      client.emit('unauthorized_error', {
        statusMessage: 'invalidToken',
        message: 'invalidTokenProvided',
      });
      client.disconnect();
    }
  }

  emitCommunityUnreadChanged() {
    this.server.to('community').emit('community_changed', {});
  }

  emitUserRestrictionChanged(userId: number) {
    this.server
      ?.to(`community:user:${userId}`)
      .emit('community_changed', { restrictionChanged: true });
  }
}
