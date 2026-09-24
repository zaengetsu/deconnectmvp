import { Injectable } from '@nestjs/common';
import type { DomainEvent, DomainEventType } from '@rekonect/contracts';
import type { Tx } from '../prisma/prisma.service';

export type EventHandler<T extends DomainEventType> = (event: DomainEvent<T>, tx: Tx) => Promise<void>;

interface Registration {
  consumer: string;
  handler: EventHandler<DomainEventType>;
}

/**
 * Registre des consommateurs. Chaque module s'abonne dans son onModuleInit :
 *   registry.on('activity.validated', 'notifications', (e, tx) => ...)
 * Le nom du consommateur sert de clé d'idempotence (table processed_events).
 * Le jour où un module devient un microservice, ses abonnements passent sur le broker sans changer.
 */
@Injectable()
export class EventRegistry {
  private readonly handlers = new Map<DomainEventType, Registration[]>();

  on<T extends DomainEventType>(type: T, consumer: string, handler: EventHandler<T>): void {
    const list = this.handlers.get(type) ?? [];
    if (list.some((r) => r.consumer === consumer)) {
      throw new Error(`Consommateur « ${consumer} » déjà abonné à ${type}`);
    }
    list.push({ consumer, handler: handler as EventHandler<DomainEventType> });
    this.handlers.set(type, list);
  }

  handlersFor(type: string): readonly Registration[] {
    return this.handlers.get(type as DomainEventType) ?? [];
  }

  types(): DomainEventType[] {
    return [...this.handlers.keys()];
  }
}
