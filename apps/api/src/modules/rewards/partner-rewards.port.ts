import type { PrismaService, Tx } from '../../platform/prisma/prisma.service';

/**
 * Port synchrone vers le module partenaires, appelé DANS la transaction d'approbation :
 * le stock et l'attribution du code ne peuvent pas diverger de la remise de la récompense.
 */
export interface PartnerRewardsPort {
  /** Vérifie qu'une récompense partenaire peut encore être demandée (offre publiée, stock, âge, zone). */
  assertRequestable(tx: Tx, offerId: string, childAge: number, parentId?: string): Promise<void>;
  /** Réserve le stock et attribue un code à la famille ; renvoie le code éventuel. */
  onApproved(tx: Tx, input: { offerId: string; requestId: string; parentId: string; childId: string }): Promise<{ code: string | null }>;
  /** Offres visibles par la famille (consentement, plan, zone, période) parmi une liste. */
  visibleOfferIds(db: Tx | PrismaService, parentId: string, offerIds: string[]): Promise<Set<string>>;
}

export const PARTNER_REWARDS = Symbol('PARTNER_REWARDS');
