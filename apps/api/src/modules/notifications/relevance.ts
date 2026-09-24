import type { Tx } from '../../platform/prisma/prisma.service';

interface ScheduledNotification {
  type: string | null;
  entityType: string | null;
  entityId: string | null;
}

/**
 * Au moment d'envoyer une notification programmée, l'entité est relue :
 * pas de rappel sur une activité terminée, annulée ou abandonnée, ni sur une récompense déjà remise (5.9).
 */
export async function stillRelevant(tx: Tx, n: ScheduledNotification): Promise<boolean> {
  if (!n.entityId || !n.entityType) return true;

  switch (n.entityType) {
    case 'child_activity': {
      const ca = await tx.childActivity.findUnique({ where: { id: n.entityId }, select: { status: true, child: { select: { isActive: true } } } });
      if (!ca || !ca.child.isActive) return false;
      if (n.type === 'activity_reminder' || n.type === 'activity_planned') return ca.status === 'selected';
      return !['validated', 'rejected'].includes(ca.status);
    }
    case 'reward_request': {
      const rr = await tx.rewardRequest.findUnique({ where: { id: n.entityId }, select: { status: true } });
      if (!rr) return false;
      return n.type === 'reward_pending' ? rr.status === 'pending' : true;
    }
    case 'duo_challenge': {
      const duo = await tx.duoChallenge.findUnique({ where: { id: n.entityId }, select: { status: true } });
      return !!duo && ['invited', 'accepted', 'active'].includes(duo.status);
    }
    case 'ritual_occurrence': {
      const occ = await tx.familyRitualOccurrence.findUnique({ where: { id: n.entityId }, select: { status: true } });
      return occ?.status === 'planned';
    }
    default:
      return true;
  }
}
