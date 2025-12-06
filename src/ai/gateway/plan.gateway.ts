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
export class PlanGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: AuthenticatedSocket) {
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

      client.join(`user:${userId}`);
    } catch (e) {
      client.emit('unauthorized_error', {
        statusMessage: 'invalidToken',
        message: 'invalidTokenProvided',
      });
      client.disconnect();
    }
  }

  emitPlanStatusChanged(userId: number) {
    console.log(
      'Emitting plan status changed for user:',
      userId,
      'emitPlanStatusChanged',
    );
    this.server.to(`user:${userId}`).emit('plan_status_changed', {});
  }
}
