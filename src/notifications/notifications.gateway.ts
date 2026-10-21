import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/notifications',
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      let token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization ||
        client.handshake.query?.token;

      if (!token && client.handshake.headers?.cookie) {
        const match = client.handshake.headers.cookie.match(
          /(?:^|;\s*)token=([^;]+)/,
        );
        if (match) {
          token = decodeURIComponent(match[1]);
        }
      }

      if (typeof token === 'string' && token.startsWith('Bearer ')) {
        token = token.slice(7).trim();
      }

      if (!token) {
        this.logger.warn(`Client connection rejected: No token provided (${client.id})`);
        client.disconnect();
        return;
      }

      const secret =
        this.configService.get<string>('JWT_SECRET') ||
        'default-fallback-secret-key';
      const payload = await this.jwtService.verifyAsync(token, { secret });

      client.data.user = payload;

      // Join individual user room
      const userRoom = `user_${payload.sub}`;
      client.join(userRoom);

      // Join facility room if applicable (for staff/managers)
      if (payload.facilityId) {
        client.join(`facility_${payload.facilityId}`);
      }

      // Join role-based room (e.g. role_STAFF, role_ADMIN, role_CUSTOMER)
      if (payload.role) {
        client.join(`role_${payload.role}`);
      }

      this.logger.log(
        `Socket connected: ${client.id} | User: ${payload.sub} (${payload.role})`,
      );

      client.emit('connected', {
        status: 'OK',
        userId: payload.sub,
        role: payload.role,
      });
    } catch (error) {
      this.logger.warn(
        `Socket connection auth failed (${client.id}): ${error.message}`,
      );
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Socket disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_facility')
  handleJoinFacility(
    @ConnectedSocket() client: Socket,
    @MessageBody() facilityId: string,
  ) {
    if (facilityId) {
      client.join(`facility_${facilityId}`);
      return { status: 'joined', facilityId };
    }
  }

  @SubscribeMessage('leave_facility')
  handleLeaveFacility(
    @ConnectedSocket() client: Socket,
    @MessageBody() facilityId: string,
  ) {
    if (facilityId) {
      client.leave(`facility_${facilityId}`);
      return { status: 'left', facilityId };
    }
  }

  sendToUser(userId: string, event: string, data: any) {
    if (this.server) {
      this.server.to(`user_${userId}`).emit(event, data);
    }
  }

  sendToFacility(facilityId: string, event: string, data: any) {
    if (this.server) {
      this.server.to(`facility_${facilityId}`).emit(event, data);
    }
  }

  sendToRole(role: string, event: string, data: any) {
    if (this.server) {
      this.server.to(`role_${role}`).emit(event, data);
    }
  }

  broadcast(event: string, data: any) {
    if (this.server) {
      this.server.emit(event, data);
    }
  }
}
