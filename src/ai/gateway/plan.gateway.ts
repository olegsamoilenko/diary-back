import { Inject, forwardRef } from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import { authenticateSocket } from 'src/auth/socket-auth';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server } from 'socket.io';
import { AuthenticatedSocket } from 'src/ai/types';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class PlanGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    const user = await authenticateSocket(
      client,
      this.jwtService,
      this.usersService,
    );
    if (!user) return;
    void client.join(`user:${user.id}`);
  }

  emitPlanStatusChanged(userId: number) {
    this.server.to(`user:${userId}`).emit('plan_status_changed', {});
  }
}
