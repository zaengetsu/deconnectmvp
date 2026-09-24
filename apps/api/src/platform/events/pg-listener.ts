import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Client } from 'pg';
import { ENV, type Env } from '../../config/env';

type Listener = (payload: string) => void;

/**
 * Connexion dédiée LISTEN/NOTIFY : transporte les signaux temps réel entre processus
 * (worker → instances API) sans Redis. Reconnexion automatique.
 */
@Injectable()
export class PgListener implements OnModuleDestroy {
  private readonly logger = new Logger('PgListener');
  private client?: Client;
  private readonly listeners = new Map<string, Set<Listener>>();
  private closing = false;
  private connecting?: Promise<void>;

  constructor(@Inject(ENV) private readonly env: Env) {}

  async listen(channel: string, fn: Listener): Promise<() => void> {
    if (!/^[a-z_]+$/.test(channel)) throw new Error(`Canal invalide : ${channel}`);
    const set = this.listeners.get(channel) ?? new Set();
    const isNew = set.size === 0;
    set.add(fn);
    this.listeners.set(channel, set);
    await this.ensureConnected();
    if (isNew) await this.client!.query(`LISTEN ${channel}`);
    return () => set.delete(fn);
  }

  private ensureConnected(): Promise<void> {
    if (this.client) return Promise.resolve();
    this.connecting ??= this.connect().finally(() => (this.connecting = undefined));
    return this.connecting;
  }

  private async connect(): Promise<void> {
    const client = new Client({ connectionString: this.env.DATABASE_URL });
    client.on('notification', (msg) => {
      for (const fn of this.listeners.get(msg.channel) ?? []) fn(msg.payload ?? '');
    });
    client.on('error', (err) => this.logger.warn(`Connexion perdue : ${err.message}`));
    client.on('end', () => {
      this.client = undefined;
      if (!this.closing) setTimeout(() => void this.reconnect(), 1000);
    });
    await client.connect();
    this.client = client;
  }

  private async reconnect(): Promise<void> {
    try {
      await this.ensureConnected();
      for (const channel of this.listeners.keys()) await this.client!.query(`LISTEN ${channel}`);
    } catch (err) {
      this.logger.warn(`Reconnexion impossible : ${(err as Error).message}`);
      setTimeout(() => void this.reconnect(), 5000);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.closing = true;
    await this.client?.end().catch(() => undefined);
  }
}
