// Catalogue des événements de domaine. Chaque événement est versionné : un changement
// incompatible de payload crée un nouveau `version`, les consommateurs gèrent les deux.

export interface EventActor {
  kind: 'parent' | 'child' | 'partner' | 'admin' | 'system';
  id: string;
}

export interface DomainEventMap {
  'user.registered': { userId: string; role: 'parent' | 'admin' | 'partner'; email: string };
  'child.created': { childId: string; parentId: string };
  'child.device_linked': { childId: string; parentId: string };

  'activity.assigned': { childActivityId: string; childId: string; parentId: string; activityId: string };
  'activity.planned': { childActivityId: string; childId: string; scheduledFor: string };
  'activity.submitted': { childActivityId: string; childId: string; parentId: string; activityId: string };
  'activity.validated': {
    childActivityId: string;
    childId: string;
    parentId: string;
    activityId: string;
    categoryId: string | null;
    points: number;
    newTotal: number;
    newLevel: number;
    levelUp: boolean;
    badgesAwarded: number;
  };
  'activity.rejected': { childActivityId: string; childId: string; reason: string | null };
  'activity.abandoned': { childActivityId: string; childId: string };

  'reward.requested': { requestId: string; rewardId: string; childId: string; parentId: string };
  'reward.approved': { requestId: string; rewardId: string; childId: string; parentId: string; pointsDeducted: number };
  'reward.rejected': { requestId: string; rewardId: string; childId: string; note: string | null };
  'reward.delivered': { requestId: string; rewardId: string; childId: string };

  'friend.requested': { friendshipId: string; childId: string; friendChildId: string };
  'duo.invited': { challengeId: string; initiatorChildId: string; partnerChildId: string; startsAt: string | null };
  'duo.accepted': { challengeId: string };
  'duo.closed': { challengeId: string; status: 'declined' | 'cancelled' | 'expired' };
  'duo.completed': { challengeId: string; bonusPoints: number };

  'ritual.scheduled': {
    occurrenceId: string;
    ritualId: string;
    parentId: string;
    title: string;
    scheduledAt: string;
    startTime: string;
  };
  'ritual.closed': { occurrenceId: string; status: 'missed' | 'cancelled' };
  'ritual.done': { occurrenceId: string; ritualId: string; attendees: string[]; points: number };
  'goal.progress': { goalId: string; parentId: string; remaining: number };
  'goal.completed': { goalId: string; parentId: string; done: number };

  'offer.submitted': { offerId: string; partnerId: string };
  'offer.published': { offerId: string; partnerId: string; kind: string };
  'offer.rejected': { offerId: string; partnerId: string; reason: string };
  'offer.unlocked': { claimId: string; offerId: string; parentId: string; childId: string | null };
  'offer.redeemed': { claimId: string; offerId: string };

  'billing.subscription_changed': { ownerKind: 'family' | 'partner'; ownerId: string; planId: string; previousPlanId: string; status: string };
  'billing.payment_failed': { ownerKind: 'family' | 'partner'; ownerId: string; amountCents: number; invoiceId: string };
  'activity.reported': { reportId: string; activityId: string; reason: string };
}

export type DomainEventType = keyof DomainEventMap;

export interface DomainEvent<T extends DomainEventType = DomainEventType> {
  id: string;
  type: T;
  version: number;
  occurredAt: string;
  aggregateType: string;
  aggregateId: string;
  actor?: EventActor | null;
  correlationId?: string | null;
  payload: DomainEventMap[T];
}
