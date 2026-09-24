import { Logger, OnModuleInit } from '@nestjs/common';

import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { TokenVerifier } from '../../platform/auth/token-verifier';
import { PgListener } from '../../platform/events/pg-listener';

export function roomFor(recipientType: string, recipientId: string): string {
  return `${recipientType}:${recipientId}`;
}

/**
 * Temps réel du centre de notifications : chaque session rejoint sa salle (parent:<id> / child:<id>).
 * Le signal vient de Postgres (LISTEN notifications) : il fonctionne quel que soit le processus
 * qui a créé la notification (API ou worker) et le nombre d'instances.
 */
@WebSocketGateway({ namespace: '/realtime', cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnModuleInit {
  private readonly logger = new Logger('Realtime');
  @WebSocketServer() server!: Server;

  constructor(
    private readonly verifier: TokenVerifier,
    private readonly listener: PgListener,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.listener.listen('notifications', (payload) => this.dispatch(payload));
    } catch (err) {
      this.logger.warn(`Temps réel indisponible : ${(err as Error).message}`);
    }
  }

  dispatch(payload: string): void {
    try {
      const { id, recipientType, recipientId } = JSON.parse(payload) as { id: string; recipientType: string; recipientId: string };
      this.server?.to(roomFor(recipientType, recipientId)).emit('notification', { id });
    } catch {
      this.logger.warn(`Signal illisible : ${payload}`);
    }
  }

  async handleConnection(client: Socket): Promise<void> {
    const token = (client.handshake.auth?.token as string | undefined) ?? client.handshake.headers.authorization?.replace(/^Bearer /, '');
    const p = token ? await this.verifier.verify(token) : null;
    if (!p) {
      client.emit('error', { code: 'UNAUTHORIZED' });
      client.disconnect(true);
      return;
    }
    await client.join(p.kind === 'child' ? roomFor('child', p.childId) : roomFor('parent', p.userId));
  }
}
