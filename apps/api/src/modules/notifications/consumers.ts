import { Injectable, OnModuleInit } from '@nestjs/common';
import { type DomainEventType, formatEuros } from '@rekonect/contracts';
import { Mailer } from '../../platform/mail/mailer';
import { mails } from '../../platform/mail/templates';
import { Clock } from '../../platform/clock';
import { familyTimeZone } from '../../platform/family-tz';
import { type EventHandler, EventRegistry } from '../../platform/events/event-registry';
import type { Tx } from '../../platform/prisma/prisma.service';
import { localDateString, zonedTimeToUtc } from '../../platform/time';
import { NotificationService } from './notification.service';
import { templates } from './templates';

/** Heure du rappel d'une activité planifiée pour la journée (heure locale de la famille). */
export const REMINDER_LOCAL_TIME = { hour: 17, minute: 0 };

const childRef = { id: true, displayName: true, age: true, parentId: true } as const;

/**
 * Traduction des événements métier en notifications (5.11) : un consommateur par événement,
 * idempotent grâce à processed_events + dedup_key. Aucun composant frontend ne crée de notification.
 */
@Injectable()
export class NotificationConsumers implements OnModuleInit {
  constructor(
    private readonly registry: EventRegistry,
    private readonly notifications: NotificationService,
    private readonly clock: Clock,
    private readonly mailer: Mailer,
  ) {}

  private on<T extends DomainEventType>(type: T, handler: EventHandler<T>): void {
    this.registry.on(type, 'notifications', async (event, tx) => {
      // Pendant la migration, les triggers SQL envoient encore : on évite les doublons.
      if (!this.notifications.engineEnabled) return;
      await handler(event, tx);
    });
  }

  private child(tx: Tx, id: string) {
    return tx.child.findUniqueOrThrow({ where: { id }, select: childRef });
  }

  onModuleInit(): void {
    const n = this.notifications;

    // ─── Activités ───
    this.on('activity.assigned', async (e, tx) => {
      const [child, a] = await Promise.all([this.child(tx, e.payload.childId), tx.activity.findUniqueOrThrow({ where: { id: e.payload.activityId } })]);
      await n.enqueue(tx, templates.activityAssigned(child, a, e.payload.childActivityId));
    });

    this.on('activity.planned', async (e, tx) => {
      const ca = await tx.childActivity.findUniqueOrThrow({ where: { id: e.payload.childActivityId }, include: { activity: true, child: { select: childRef } } });
      await n.cancelScheduled(tx, 'child_activity', ca.id, ['activity_reminder']);
      const tz = await familyTimeZone(tx, ca.child.parentId);
      const [y, m, d] = e.payload.scheduledFor.split('-').map(Number);
      const at = zonedTimeToUtc(y, m, d, REMINDER_LOCAL_TIME.hour, REMINDER_LOCAL_TIME.minute, tz);
      if (at <= this.clock.now()) return; // trop tard pour rappeler aujourd'hui
      // La clé inclut la date : replanifier le même jour ne crée pas de doublon, un autre jour oui.
      const draft = templates.activityReminder(ca.child, ca.activity, ca.id, at);
      await n.enqueue(tx, { ...draft, dedupKey: `${draft.dedupKey}:${e.payload.scheduledFor}` });
    });

    this.on('activity.submitted', async (e, tx) => {
      const [child, a] = await Promise.all([this.child(tx, e.payload.childId), tx.activity.findUniqueOrThrow({ where: { id: e.payload.activityId } })]);
      await n.cancelScheduled(tx, 'child_activity', e.payload.childActivityId);
      await n.enqueue(tx, { ...templates.activityValidationRequired(child, a, e.payload.childActivityId), dedupKey: `validation:${e.id}` });
    });

    this.on('activity.validated', async (e, tx) => {
      const p = e.payload;
      const [child, a] = await Promise.all([this.child(tx, p.childId), tx.activity.findUniqueOrThrow({ where: { id: p.activityId } })]);
      await n.cancelScheduled(tx, 'child_activity', p.childActivityId);
      const day = localDateString(this.clock.now(), await familyTimeZone(tx, child.parentId));
      await n.enqueue(tx, templates.activityValidated(child, a, p.childActivityId, p.points));
      await n.enqueue(tx, templates.activityCompleted(child, a, p.childActivityId, p.points, day));
      if (p.levelUp) await n.enqueue(tx, templates.levelUp(child, p.newLevel));
      if (p.badgesAwarded > 0) await n.enqueue(tx, templates.badgeEarned(child, p.badgesAwarded, p.childActivityId));
    });

    this.on('activity.rejected', async (e, tx) => {
      const ca = await tx.childActivity.findUniqueOrThrow({ where: { id: e.payload.childActivityId }, include: { activity: true, child: { select: childRef } } });
      await n.cancelScheduled(tx, 'child_activity', ca.id);
      await n.enqueue(tx, { ...templates.activityRejected(ca.child, ca.activity, ca.id, e.payload.reason), dedupKey: `rejected:${e.id}` });
    });

    this.on('activity.abandoned', async (e, tx) => {
      await n.cancelScheduled(tx, 'child_activity', e.payload.childActivityId);
    });

    // ─── Récompenses ───
    this.on('reward.requested', async (e, tx) => {
      const p = e.payload;
      const [child, reward] = await Promise.all([this.child(tx, p.childId), tx.reward.findUniqueOrThrow({ where: { id: p.rewardId } })]);
      const now = this.clock.now().getTime();
      await n.enqueue(tx, templates.rewardRequested(child, reward, p.requestId));
      await n.enqueue(tx, templates.rewardPending(child, reward, p.requestId, 24, new Date(now + 24 * 3_600_000)));
      await n.enqueue(tx, templates.rewardPending(child, reward, p.requestId, 48, new Date(now + 48 * 3_600_000)));
    });

    this.on('reward.approved', async (e, tx) => {
      const p = e.payload;
      const [child, reward] = await Promise.all([this.child(tx, p.childId), tx.reward.findUniqueOrThrow({ where: { id: p.rewardId } })]);
      await n.cancelScheduled(tx, 'reward_request', p.requestId, ['reward_pending']);
      await n.enqueue(tx, templates.rewardApproved(child, reward, p.requestId));
    });

    this.on('reward.rejected', async (e, tx) => {
      const p = e.payload;
      const [child, reward] = await Promise.all([this.child(tx, p.childId), tx.reward.findUniqueOrThrow({ where: { id: p.rewardId } })]);
      await n.cancelScheduled(tx, 'reward_request', p.requestId);
      await n.enqueue(tx, templates.rewardRejected(child, reward, p.requestId, p.note));
    });

    this.on('reward.delivered', async (e, tx) => {
      await n.cancelScheduled(tx, 'reward_request', e.payload.requestId);
    });

    // ─── Famille & amis ───
    this.on('child.device_linked', async (e, tx) => {
      const child = await this.child(tx, e.payload.childId);
      await n.enqueue(tx, { ...templates.deviceLinked(child), dedupKey: `device_linked:${e.id}` });
    });

    this.on('friend.requested', async (e, tx) => {
      const [a, b] = await Promise.all([this.child(tx, e.payload.childId), this.child(tx, e.payload.friendChildId)]);
      await n.enqueue(tx, templates.friendRequest(a.parentId, a, b, e.payload.friendshipId, 'a', a.id));
      await n.enqueue(tx, templates.friendRequest(b.parentId, a, b, e.payload.friendshipId, 'b', b.id));
    });

    this.on('duo.invited', async (e, tx) => {
      const duo = await tx.duoChallenge.findUniqueOrThrow({ where: { id: e.payload.challengeId }, include: { activity: true, initiator: { select: childRef }, partner: { select: childRef } } });
      await n.enqueue(tx, templates.duoInvited(duo.partner, duo.initiator, duo.activity, duo.id));
      if (duo.startsAt) {
        const at = new Date(duo.startsAt.getTime() - 10 * 60_000);
        if (at > this.clock.now()) {
          await n.enqueue(tx, templates.duoStartingSoon(duo.partner, duo.initiator, duo.activity, duo.id, at, 'p'));
          await n.enqueue(tx, templates.duoStartingSoon(duo.initiator, duo.partner, duo.activity, duo.id, at, 'i'));
        }
      }
    });

    this.on('duo.accepted', async (e, tx) => {
      const duo = await tx.duoChallenge.findUniqueOrThrow({ where: { id: e.payload.challengeId }, include: { activity: true, initiator: { select: childRef }, partner: { select: childRef } } });
      await n.enqueue(tx, templates.duoAccepted(duo.initiator, duo.partner, duo.activity, duo.id));
    });

    this.on('duo.closed', async (e, tx) => {
      await n.cancelScheduled(tx, 'duo_challenge', e.payload.challengeId);
    });

    this.on('duo.completed', async (e, tx) => {
      const duo = await tx.duoChallenge.findUniqueOrThrow({ where: { id: e.payload.challengeId }, include: { activity: true, initiator: { select: childRef }, partner: { select: childRef } } });
      await n.cancelScheduled(tx, 'duo_challenge', duo.id);
      await n.enqueue(tx, templates.duoCompletedChild(duo.initiator, duo.partner, duo.id, e.payload.bonusPoints, 'i'));
      await n.enqueue(tx, templates.duoCompletedChild(duo.partner, duo.initiator, duo.id, e.payload.bonusPoints, 'p'));
      // Chaque parent voit passer le duo, en in-app seulement.
      for (const parentId of new Set([duo.initiator.parentId, duo.partner.parentId])) {
        const own = duo.initiator.parentId === parentId ? duo.initiator : duo.partner;
        const other = own === duo.initiator ? duo.partner : duo.initiator;
        await n.enqueue(tx, templates.duoCompletedParent(parentId, own, other, duo.activity, duo.id));
      }
    });

    // ─── Rituels & objectifs ───
    this.on('ritual.scheduled', async (e, tx) => {
      const p = e.payload;
      const at = new Date(p.scheduledAt).getTime();
      const now = this.clock.now().getTime();
      if (at - 86_400_000 > now) await n.enqueue(tx, templates.ritualTomorrow(p.parentId, p.title, p.startTime, p.occurrenceId, new Date(at - 86_400_000)));
      if (at - 3_600_000 > now) {
        const children = await tx.child.findMany({ where: { parentId: p.parentId, isActive: true }, select: childRef });
        for (const c of children) await n.enqueue(tx, templates.ritualSoon(c, p.title, p.startTime, p.occurrenceId, new Date(at - 3_600_000)));
      }
    });

    // Choix produit assumé : un rituel manqué ne déclenche aucune relance.
    this.on('ritual.closed', async (e, tx) => {
      await n.cancelScheduled(tx, 'ritual_occurrence', e.payload.occurrenceId);
    });

    this.on('ritual.done', async (e, tx) => {
      const p = e.payload;
      await n.cancelScheduled(tx, 'ritual_occurrence', p.occurrenceId);
      const ritual = await tx.familyRitual.findUniqueOrThrow({ where: { id: p.ritualId } });
      for (const childId of p.attendees) {
        await n.enqueue(tx, templates.ritualThanks(await this.child(tx, childId), ritual.title, p.points, p.occurrenceId));
      }
    });

    this.on('goal.completed', async (e, tx) => {
      await n.enqueue(tx, templates.goalCompleted(e.payload.parentId, e.payload.goalId, e.payload.done));
    });

    this.on('goal.progress', async (e, tx) => {
      await n.enqueue(tx, templates.goalAlmost(e.payload.parentId, e.payload.goalId));
    });

    // ─── Facturation ───
    this.on('billing.payment_failed', async (e, tx) => {
      const p = e.payload;
      const amount = formatEuros(p.amountCents, { decimals: 'always' });
      if (p.ownerKind === 'family') {
        const sub = await tx.subscription.findFirst({ where: { parentId: p.ownerId }, include: { planRef: { select: { name: true } } } });
        await n.enqueue(tx, templates.paymentFailed(p.ownerId, amount, sub?.planRef.name ?? 'actuel', p.invoiceId));
        return;
      }
      const owners = await tx.partnerMember.findMany({ where: { partnerId: p.ownerId, role: 'owner', status: 'active' } });
      for (const o of owners) {
        const res = await this.mailer.send(mails.notification(o.email, null, 'Paiement refusé', `Le paiement de ${amount} pour votre abonnement Rekonect partenaires n’a pas abouti.\nMettez à jour votre moyen de paiement depuis Compte & facturation.`));
        if (res.status === 'failed' && res.retryable) throw new Error(res.error);
      }
    });

    // ─── Partenaires ───
    this.on('offer.unlocked', async (e, tx) => {
      const claim = await tx.offerClaim.findUniqueOrThrow({
        where: { id: e.payload.claimId },
        include: { offer: { include: { partner: { select: { name: true } } } }, child: { select: { displayName: true } } },
      });
      await n.enqueue(
        tx,
        templates.partnerOfferUnlocked(claim.parentId, claim.child?.displayName ?? null, { title: claim.offer.title, partnerName: claim.offer.partner.name }, claim.id),
      );
    });
  }
}
