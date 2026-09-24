import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent, DomainEventType } from '@rekonect/contracts';
import { Clock } from '../clock';
import { PrismaService } from '../prisma/prisma.service';
import { EventRegistry } from './event-registry';

export const OUTBOX_MAX_ATTEMPTS = 10;
const LEASE_SECONDS = 60;

interface OutboxRow {
  id: string;
  seq: bigint;
  type: string;
  version: number;
  aggregate_type: string;
  aggregate_id: string;
  actor: DomainEvent['actor'];
  payload: unknown;
  correlation_id: string | null;
  occurred_at: Date;
  attempts: number;
}

/** Délai avant nouvelle tentative : 5 s, 10 s, 20 s… plafonné à 1 h. */
export function backoffSeconds(attempts: number): number {
  return Math.min(3600, 5 * 2 ** Math.max(0, attempts - 1));
}

export interface DrainResult {
  processed: number;
  failed: number;
  dead: number;
}

/**
 * Relais outbox → consommateurs.
 * - Réservation par bail (UPDATE … FOR UPDATE SKIP LOCKED) : plusieurs workers en parallèle, sans doublon.
 * - Chaque consommateur s'exécute dans SA transaction avec l'insertion dans processed_events :
 *   un événement rejoué n'a jamais d'effet deux fois.
 * - Un consommateur en échec n'empêche pas les autres ; l'événement est retenté plus tard.
 */
@Injectable()
export class OutboxRelay {
  private readonly logger = new Logger('Outbox');

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: EventRegistry,
    private readonly clock: Clock,
  ) {}

  async drain(batchSize = 50, maxBatches = 20): Promise<DrainResult> {
    const total: DrainResult = { processed: 0, failed: 0, dead: 0 };
    for (let i = 0; i < maxBatches; i++) {
      const rows = await this.claim(batchSize);
      if (rows.length === 0) break;
      // UPDATE … RETURNING ne garantit pas l'ordre : on retrie par séquence.
      rows.sort((a, b) => (a.seq < b.seq ? -1 : 1));
      for (const row of rows) {
        const outcome = await this.process(row);
        total[outcome]++;
      }
      if (rows.length < batchSize) break;
    }
    return total;
  }

  private async claim(limit: number): Promise<OutboxRow[]> {
    const now = this.clock.now();
    const lease = new Date(now.getTime() + LEASE_SECONDS * 1000);
    return this.prisma.$queryRaw<OutboxRow[]>`
      UPDATE outbox_events SET next_attempt_at = ${lease}
      WHERE id IN (
        SELECT id FROM outbox_events
        WHERE status = 'pending' AND next_attempt_at <= ${now}
        ORDER BY seq
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, seq, type, version, aggregate_type, aggregate_id, actor, payload, correlation_id, occurred_at, attempts`;
  }

  private toEvent(row: OutboxRow): DomainEvent {
    return {
      id: row.id,
      type: row.type as DomainEventType,
      version: row.version,
      occurredAt: row.occurred_at.toISOString(),
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      actor: row.actor,
      correlationId: row.correlation_id,
      payload: row.payload as DomainEvent['payload'],
    };
  }

  private async process(row: OutboxRow): Promise<keyof DrainResult> {
    const event = this.toEvent(row);
    const errors: string[] = [];

    for (const { consumer, handler } of this.registry.handlersFor(row.type)) {
      try {
        await this.prisma.tx(async (tx) => {
          const inserted = await tx.$executeRaw`
            INSERT INTO processed_events (event_id, consumer) VALUES (${row.id}::uuid, ${consumer})
            ON CONFLICT DO NOTHING`;
          if (inserted === 0) return; // déjà traité par ce consommateur
          await handler(event, tx);
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${consumer}: ${message}`);
        this.logger.warn(`${row.type} (${row.id}) → ${consumer} a échoué : ${message}`);
      }
    }

    const now = this.clock.now();
    if (errors.length === 0) {
      await this.prisma.outboxEvent.update({
        where: { id: row.id },
        data: { status: 'published', publishedAt: now, lastError: null },
      });
      return 'processed';
    }

    const attempts = row.attempts + 1;
    const dead = attempts >= OUTBOX_MAX_ATTEMPTS;
    await this.prisma.outboxEvent.update({
      where: { id: row.id },
      data: {
        attempts,
        status: dead ? 'dead' : 'pending',
        lastError: errors.join(' | ').slice(0, 2000),
        nextAttemptAt: new Date(now.getTime() + backoffSeconds(attempts) * 1000),
      },
    });
    if (dead) this.logger.error(`${row.type} (${row.id}) abandonné après ${attempts} tentatives`);
    return dead ? 'dead' : 'failed';
  }

  /** Remet un événement mort ou en échec dans la file (action admin). */
  async retry(eventId: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id: eventId },
      data: { status: 'pending', attempts: 0, nextAttemptAt: this.clock.now(), lastError: null },
    });
  }
}
