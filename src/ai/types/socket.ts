import { Socket } from 'socket.io';
import { User } from 'src/users/entities/user.entity';

export interface SocketAuthPayload {
  token: string;
  appVersion?: string;
  appBuild?: string;
  platform?: string;
}

export interface AuthenticatedSocket extends Socket {
  user?: User;
  data: {
    appVersion?: string;
    appBuild?: string;
    platform?: string;
  };
}
