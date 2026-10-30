import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayInit,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { FRONTEND_ORIGIN } from '../origins.config.js';

@WebSocketGateway({
  namespace: '/service-request-messages',
  cors: {
    origin: FRONTEND_ORIGIN,
  },
})
export class ServiceRequestMessagesGateway
  implements OnGatewayInit<Namespace>, OnGatewayConnection<Socket>
{
  @WebSocketServer()
  private server: Namespace;
  constructor(private readonly jwtService: JwtService) {}

  notifyConversationChanged(
    serviceRequestId: number,
    requesterUserId: number,
    recipientUserId: number,
  ): void {
    this.server
      .to([`user:${requesterUserId}`, `user:${recipientUserId}`])
      .emit('conversation.changed', { serviceRequestId });
  }

  private async authenticate(accessToken: unknown): Promise<{ userId: number; expiresAt: number }> {
    if (typeof accessToken !== 'string' || accessToken.trim() === '') {
      throw new Error('Invalid access token');
    }

    const payload = await this.jwtService.verifyAsync<{ sub?: unknown; exp?: unknown }>(
      accessToken,
    );

    if (typeof payload.sub !== 'string' || !/^[1-9]\d*$/.test(payload.sub)) {
      throw new Error('Invalid access token');
    }

    const userId = Number(payload.sub);

    if (
      !Number.isSafeInteger(userId) ||
      typeof payload.exp !== 'number' ||
      !Number.isSafeInteger(payload.exp) ||
      payload.exp <= Date.now() / 1000
    ) {
      throw new Error('Invalid access token');
    }

    return { userId, expiresAt: payload.exp * 1000 };
  }

  afterInit(server: Namespace) {
    server.use(async (socket, next) => {
      try {
        const identity = await this.authenticate(socket.handshake.auth.accessToken);

        socket.data.userId = identity.userId;
        socket.data.expiresAt = identity.expiresAt;
      } catch {
        next(new Error('Unauthorized'));
        return;
      }

      next();
    });
  }

  async handleConnection(socket: Socket): Promise<void> {
    const remainingTime = socket.data.expiresAt - Date.now();

    if (remainingTime <= 0) {
      socket.disconnect();
      return;
    }

    const expirationTime = setTimeout(() => {
      socket.disconnect();
    }, remainingTime);

    socket.once('disconnect', () => {
      clearTimeout(expirationTime);
    });

    try {
      await socket.join(`user:${socket.data.userId}`);
    } catch {
      socket.disconnect();
    }
  }
}
