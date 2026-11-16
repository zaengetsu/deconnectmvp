import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventRegistry } from '../../platform/events/event-registry';
import { BillingGateway } from './gateway';

/**
 * Suites d'un compte supprimé par son titulaire : ses abonnements Stripe ne doivent plus se
 * renouveler. Les lignes `subscriptions` sont déjà parties avec le profil (cascade) ; l'événement
 * porte les identifiants Stripe. Résiliation en fin de période : la période payée reste due, rien
 * n'est remboursé automatiquement. Idempotent : demander deux fois la même résiliation est sans effet.
 */
@Injectable()
export class BillingConsumers implements OnModuleInit {
  private readonly logger = new Logger('Billing');

  constructor(
    private readonly registry: EventRegistry,
    private readonly gateway: BillingGateway,
  ) {}

  onModuleInit(): void {
    this.registry.on('user.account_deleted', 'billing', async (e) => {
      if (!this.gateway.enabled) return;
      for (const id of e.payload.stripeSubscriptionIds) {
        try {
          await this.gateway.setCancelAtPeriodEnd(id, true);
        } catch (err) {
          // Abonnement déjà supprimé côté Stripe : rien à résilier.
          if (/No such subscription|resource_missing/i.test(String((err as Error)?.message))) continue;
          this.logger.error(`Résiliation de ${id} impossible : ${(err as Error)?.message}`);
          throw err;
        }
      }
    });
  }
}
