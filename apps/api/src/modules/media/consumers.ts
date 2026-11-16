import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventRegistry } from '../../platform/events/event-registry';

/**
 * Suites d'un compte supprimé par son titulaire : les preuves d'activité (photos, vidéos) des
 * enfants n'ont pas de clé étrangère vers eux et survivraient à la cascade. L'événement porte les
 * identifiants des enfants supprimés. Idempotent : un second passage ne trouve plus rien.
 */
@Injectable()
export class MediaConsumers implements OnModuleInit {
  constructor(private readonly registry: EventRegistry) {}

  onModuleInit(): void {
    this.registry.on('user.account_deleted', 'media', async (e, tx) => {
      if (e.payload.childIds.length === 0) return;
      await tx.mediaFile.deleteMany({ where: { kind: 'proof', childId: { in: e.payload.childIds } } });
    });
  }
}
