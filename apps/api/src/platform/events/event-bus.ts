import { Injectable } from '@nestjs/common';
import type { DomainEventMap, DomainEventType, EventActor } from '@rekonect/contracts';
import { Clock } from '../clock';
import type { Tx } from '../prisma/prisma.service';

export interface PublishInput<T extends DomainEventType> {
  aggregateType: string;
  aggregateId: string;
  payload: DomainEventMap[T];
  actor?: EventActor | null;
  correlationId?: string | null;
  version?: number;
}

/**
 * Publication d'événements via l'outbox : l'événement est écrit DANS la transaction métier.
 * Si la transaction échoue, l'événement n'existe pas ; si elle réussit, il sera livré au moins une fois.
 */
@Injectable()
export class EventBus {
  constructor(private readonly clock: Clock) {}

  async publish<T extends DomainEventType>(tx: Tx, type: T, input: PublishInput<T>): Promise<string> {
    const row = await tx.outboxEvent.create({
      data: {
        type,
        version: input.version ?? 1,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        actor: (input.actor ?? undefined) as object | undefined,
        payload: input.payload as object,
        correlationId: input.correlationId ?? null,
        occurredAt: this.clock.now(),
        nextAttemptAt: this.clock.now(),
      },
      select: { id: true },
    });
    // Réveille le relais immédiatement après le commit (sinon il repasse au prochain tick).
    await tx.$executeRaw`SELECT pg_notify('outbox', ${type})`;
    return row.id;
  }
}
