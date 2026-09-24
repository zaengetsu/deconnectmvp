// Catalogue des messages : tous les textes vivent côté serveur (5.2), avec un ton adapté à l'âge (5.17).
// Règles : positif, court, jamais culpabilisant pour l'enfant ; jamais infantilisant pour l'ado.
import { type AgeTone, ageTone, type NotificationChannel, type NotificationPriority, type NotificationType, type RecipientType } from '@rekonect/contracts';

export interface NotificationDraft {
  recipientType: RecipientType;
  recipientId: string;
  type: NotificationType;
  title: string;
  body: string;
  icon: string;
  route: string | null;
  data?: Record<string, unknown>;
  priority: NotificationPriority;
  channels: NotificationChannel[];
  entityType?: string | null;
  entityId?: string | null;
  actorChildId?: string | null;
  dedupKey?: string | null;
  groupKey?: string | null;
  scheduledAt?: Date | null;
}

interface ChildRef {
  id: string;
  displayName: string;
  age: number;
  parentId: string;
}

const PUSH: NotificationChannel[] = ['in_app', 'push'];
const q = (title: string) => `« ${title} »`;
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

function tone(child: ChildRef): AgeTone {
  return ageTone(child.age);
}

export const templates = {
  // ─── Activités ─────────────────────────────────────────────────────────────

  activityAssigned(child: ChildRef, a: { id: string; title: string }, childActivityId: string): NotificationDraft {
    const t = tone(child);
    return {
      recipientType: 'child',
      recipientId: child.id,
      type: 'activity_assigned',
      title: t === 'young' ? '🌟 Nouvelle activité !' : t === 'teen' ? 'Nouvelle activité proposée' : '✨ Nouvelle activité',
      body: t === 'teen' ? `${q(a.title)} t’a été proposée.` : `${q(a.title)} t’attend. On s’y met ?`,
      icon: '✨',
      route: '/child/activities',
      data: { childActivityId },
      priority: 'normal',
      channels: PUSH,
      entityType: 'child_activity',
      entityId: childActivityId,
      actorChildId: child.id,
      dedupKey: `assigned:${childActivityId}`,
    };
  },

  activityValidationRequired(child: ChildRef, a: { title: string }, childActivityId: string): NotificationDraft {
    return {
      recipientType: 'parent',
      recipientId: child.parentId,
      type: 'activity_validation_required',
      title: `👀 ${child.displayName} a terminé son activité`,
      body: `${q(a.title)} attend votre validation.`,
      icon: '👀',
      route: `/parent/validations?focus=${childActivityId}`,
      data: { childId: child.id, childActivityId },
      priority: 'high',
      channels: PUSH,
      entityType: 'child_activity',
      entityId: childActivityId,
      actorChildId: child.id,
      dedupKey: `validation:${childActivityId}`,
    };
  },

  activityReminder(child: ChildRef, a: { title: string }, childActivityId: string, at: Date): NotificationDraft {
    const t = tone(child);
    return {
      recipientType: 'child',
      recipientId: child.id,
      type: 'activity_reminder',
      title: t === 'young' ? '🌟 C’est bientôt l’heure !' : t === 'teen' ? 'Petit rappel' : '🔔 Petit rappel',
      body: t === 'young' ? `Ton activité ${q(a.title)} t’attend aujourd’hui.` : `Tu avais prévu ${q(a.title)} aujourd’hui.`,
      icon: '🔔',
      route: `/child/activities/${childActivityId}`,
      data: { childActivityId },
      priority: 'low',
      channels: PUSH,
      entityType: 'child_activity',
      entityId: childActivityId,
      actorChildId: child.id,
      dedupKey: `reminder:${childActivityId}`,
      scheduledAt: at,
    };
  },

  activityValidated(child: ChildRef, a: { title: string }, childActivityId: string, points: number): NotificationDraft {
    const t = tone(child);
    return {
      recipientType: 'child',
      recipientId: child.id,
      type: 'activity_validated',
      title: t === 'teen' ? 'Activité validée' : '🎉 Bien joué !',
      body: t === 'young' ? `Tu as gagné ${points} points pour ${q(a.title)} !` : `+${points} points pour ${q(a.title)}.`,
      icon: '⭐',
      route: '/child/points',
      data: { points, childActivityId },
      priority: 'normal',
      channels: PUSH,
      entityType: 'child_activity',
      entityId: childActivityId,
      actorChildId: child.id,
      dedupKey: `validated:${childActivityId}`,
    };
  },

  /** Côté parent : trace en in-app seulement, regroupée par jour (5.18). */
  activityCompleted(child: ChildRef, a: { title: string }, childActivityId: string, points: number, day: string): NotificationDraft {
    return {
      recipientType: 'parent',
      recipientId: child.parentId,
      type: 'activity_completed',
      title: `✅ ${child.displayName} a terminé son activité`,
      body: `${q(a.title)} · +${points} points`,
      icon: '✅',
      route: `/parent/children/${child.id}`,
      data: { childId: child.id, points },
      priority: 'normal',
      channels: ['in_app'],
      entityType: 'child_activity',
      entityId: childActivityId,
      actorChildId: child.id,
      dedupKey: `completed:${childActivityId}`,
      groupKey: `daily:${child.parentId}:${day}`,
    };
  },

  activityRejected(child: ChildRef, a: { title: string }, childActivityId: string, reason: string | null): NotificationDraft {
    const t = tone(child);
    return {
      recipientType: 'child',
      recipientId: child.id,
      type: 'activity_rejected',
      title: t === 'teen' ? 'À revoir' : 'Presque !',
      body: reason?.trim() || `${q(a.title)} n’est pas encore validée. Tu peux réessayer !`,
      icon: '💬',
      route: `/child/activities/${childActivityId}`,
      data: { childActivityId },
      priority: 'normal',
      channels: PUSH,
      entityType: 'child_activity',
      entityId: childActivityId,
      actorChildId: child.id,
      dedupKey: `rejected:${childActivityId}`,
    };
  },

  parentPlannedReminder(child: ChildRef, a: { title: string }, childActivityId: string, day: string): NotificationDraft {
    return {
      recipientType: 'parent',
      recipientId: child.parentId,
      type: 'activity_planned',
      title: '📌 Petit rappel',
      body: `${child.displayName} avait prévu ${q(a.title)} aujourd’hui.`,
      icon: '📌',
      route: `/parent/children/${child.id}`,
      data: { childId: child.id, childActivityId },
      priority: 'low',
      channels: PUSH,
      entityType: 'child_activity',
      entityId: childActivityId,
      actorChildId: child.id,
      dedupKey: `parent_ctx:${childActivityId}:${day}`,
    };
  },

  levelUp(child: ChildRef, level: number): NotificationDraft {
    const t = tone(child);
    return {
      recipientType: 'child',
      recipientId: child.id,
      type: 'level_up',
      title: `🎉 Niveau ${level} !`,
      body: t === 'young' ? `Bravo ! Tu passes au niveau ${level} !` : `Tu passes au niveau ${level}. Continue comme ça !`,
      icon: '🏆',
      route: '/child/points',
      data: { newLevel: level },
      priority: 'normal',
      channels: PUSH,
      entityType: 'child',
      entityId: child.id,
      actorChildId: child.id,
      dedupKey: `levelup:${child.id}:${level}`,
    };
  },

  badgeEarned(child: ChildRef, count: number, sourceId: string): NotificationDraft {
    return {
      recipientType: 'child',
      recipientId: child.id,
      type: 'badge_earned',
      title: count > 1 ? '🏅 Nouveaux badges !' : '🏅 Nouveau badge !',
      body: count > 1 ? `Tu as gagné ${count} nouveaux badges !` : 'Tu as gagné un nouveau badge !',
      icon: '🏅',
      route: '/child/points',
      data: { count },
      priority: 'normal',
      channels: PUSH,
      entityType: 'child',
      entityId: child.id,
      actorChildId: child.id,
      dedupKey: `badges:${sourceId}`,
    };
  },

  // ─── Récompenses ───────────────────────────────────────────────────────────

  rewardRequested(child: ChildRef, r: { id: string; title: string }, requestId: string): NotificationDraft {
    return {
      recipientType: 'parent',
      recipientId: child.parentId,
      type: 'reward_requested',
      title: `🎁 ${child.displayName} a débloqué une récompense`,
      body: `${q(r.title)} — validez-la quand vous êtes prêt à la lui donner.`,
      icon: '🎁',
      route: `/parent/rewards/requests/${requestId}`,
      data: { childId: child.id, rewardId: r.id, requestId },
      priority: 'high',
      channels: PUSH,
      entityType: 'reward_request',
      entityId: requestId,
      actorChildId: child.id,
      dedupKey: `reward_req:${requestId}`,
    };
  },

  /** Relances si la récompense reste en attente (24 h puis 48 h), annulées dès qu'elle est traitée. */
  rewardPending(child: ChildRef, r: { title: string }, requestId: string, stage: 24 | 48, at: Date): NotificationDraft {
    return {
      recipientType: 'parent',
      recipientId: child.parentId,
      type: 'reward_pending',
      title: stage === 24 ? '🎁 Petit rappel' : 'Récompense toujours en attente',
      body:
        stage === 24
          ? `${child.displayName} attend toujours sa récompense ${q(r.title)}.`
          : `La récompense de ${child.displayName} n’a pas encore été remise. Pensez-y quand vous en aurez l’occasion.`,
      icon: '🎁',
      route: `/parent/rewards/requests/${requestId}`,
      data: { childId: child.id, requestId },
      priority: stage === 24 ? 'normal' : 'low',
      channels: PUSH,
      entityType: 'reward_request',
      entityId: requestId,
      actorChildId: child.id,
      dedupKey: `reward_pending${stage}:${requestId}`,
      scheduledAt: at,
    };
  },

  rewardApproved(child: ChildRef, r: { id: string; title: string }, requestId: string): NotificationDraft {
    return {
      recipientType: 'child',
      recipientId: child.id,
      type: 'reward_approved',
      title: tone(child) === 'teen' ? 'Récompense validée' : '🎁 Ta récompense est validée !',
      body: `${q(r.title)} — profite bien !`,
      icon: '🎁',
      route: '/child/rewards',
      data: { rewardId: r.id, requestId },
      priority: 'normal',
      channels: PUSH,
      entityType: 'reward_request',
      entityId: requestId,
      actorChildId: child.id,
      dedupKey: `reward_ok:${requestId}`,
    };
  },

  rewardRejected(child: ChildRef, r: { id: string; title: string }, requestId: string, note: string | null): NotificationDraft {
    return {
      recipientType: 'child',
      recipientId: child.id,
      type: 'reward_rejected',
      title: 'Pas pour cette fois',
      body: note?.trim() || `${q(r.title)} n’est pas disponible tout de suite. Continue, tu y es presque !`,
      icon: '💬',
      route: '/child/rewards',
      data: { rewardId: r.id, requestId },
      priority: 'normal',
      channels: PUSH,
      entityType: 'reward_request',
      entityId: requestId,
      actorChildId: child.id,
      dedupKey: `reward_ko:${requestId}`,
    };
  },

  // ─── Famille & amis ────────────────────────────────────────────────────────

  deviceLinked(child: ChildRef): NotificationDraft {
    return {
      recipientType: 'parent',
      recipientId: child.parentId,
      type: 'child_device_linked',
      title: '📱 Appareil relié',
      body: `${child.displayName} vient de relier son téléphone. Il se connecte désormais avec son code PIN.`,
      icon: '📱',
      route: `/parent/children/${child.id}`,
      data: { childId: child.id },
      priority: 'normal',
      channels: PUSH,
      entityType: 'child',
      entityId: child.id,
      actorChildId: child.id,
      dedupKey: null,
    };
  },

  friendRequest(parentId: string, from: ChildRef, to: { displayName: string }, friendshipId: string, side: 'a' | 'b', ownChildId: string): NotificationDraft {
    return {
      recipientType: 'parent',
      recipientId: parentId,
      type: 'friend_request',
      title: '👥 Demande d’ami',
      body: `${from.displayName} souhaite ajouter ${to.displayName} en ami. Votre accord est nécessaire.`,
      icon: '👥',
      route: `/parent/children/${ownChildId}/friends`,
      data: { friendshipId },
      priority: 'high',
      channels: PUSH,
      entityType: 'child_friend',
      entityId: friendshipId,
      actorChildId: ownChildId,
      dedupKey: `friend_${side}:${friendshipId}`,
    };
  },

  duoInvited(partner: ChildRef, initiator: ChildRef, a: { title: string }, challengeId: string): NotificationDraft {
    return {
      recipientType: 'child',
      recipientId: partner.id,
      type: 'friend_activity_invited',
      title: `👋 ${initiator.displayName} t’invite`,
      body: `Faire ${q(a.title)} ensemble, ça te dit ?`,
      icon: '👋',
      route: `/child/duos/${challengeId}`,
      data: { challengeId },
      priority: 'normal',
      channels: PUSH,
      entityType: 'duo_challenge',
      entityId: challengeId,
      actorChildId: initiator.id,
      dedupKey: `duo_inv:${challengeId}`,
    };
  },

  duoStartingSoon(to: ChildRef, other: ChildRef, a: { title: string }, challengeId: string, at: Date, side: 'i' | 'p'): NotificationDraft {
    return {
      recipientType: 'child',
      recipientId: to.id,
      type: 'friend_activity_started',
      title: '⏱️ Votre défi commence bientôt',
      body: `${q(a.title)} avec ${other.displayName} dans 10 minutes.`,
      icon: '⏱️',
      route: `/child/duos/${challengeId}`,
      data: { challengeId },
      priority: 'normal',
      channels: PUSH,
      entityType: 'duo_challenge',
      entityId: challengeId,
      actorChildId: other.id,
      dedupKey: `duo_start_${side}:${challengeId}`,
      scheduledAt: at,
    };
  },

  duoAccepted(initiator: ChildRef, partner: ChildRef, a: { title: string }, challengeId: string): NotificationDraft {
    return {
      recipientType: 'child',
      recipientId: initiator.id,
      type: 'friend_activity_invited',
      title: `🙌 ${partner.displayName} est partant !`,
      body: `Votre défi ${q(a.title)} est lancé.`,
      icon: '🙌',
      route: `/child/duos/${challengeId}`,
      data: { challengeId },
      priority: 'normal',
      channels: PUSH,
      entityType: 'duo_challenge',
      entityId: challengeId,
      actorChildId: partner.id,
      dedupKey: `duo_acc:${challengeId}`,
    };
  },

  duoCompletedChild(to: ChildRef, other: ChildRef, challengeId: string, bonus: number, side: 'i' | 'p'): NotificationDraft {
    return {
      recipientType: 'child',
      recipientId: to.id,
      type: 'friend_activity_completed',
      title: '🎉 Défi terminé !',
      body: `Vous avez tous les deux gagné ${bonus} points.`,
      icon: '🎉',
      route: '/child/points',
      data: { challengeId, bonus },
      priority: 'normal',
      channels: PUSH,
      entityType: 'duo_challenge',
      entityId: challengeId,
      actorChildId: other.id,
      dedupKey: `duo_done_${side}:${challengeId}`,
    };
  },

  duoCompletedParent(parentId: string, a: ChildRef, b: ChildRef, activity: { title: string }, challengeId: string): NotificationDraft {
    return {
      recipientType: 'parent',
      recipientId: parentId,
      type: 'activity_completed',
      title: '🤝 Défi à deux réussi',
      body: `${a.displayName} et ${b.displayName} ont terminé ${q(activity.title)}.`,
      icon: '🤝',
      route: `/parent/children/${a.id}`,
      data: { challengeId },
      priority: 'normal',
      channels: ['in_app'],
      entityType: 'duo_challenge',
      entityId: challengeId,
      actorChildId: a.id,
      dedupKey: `duo_parent:${challengeId}:${parentId}`,
    };
  },

  ritualTomorrow(parentId: string, title: string, startTime: string, occurrenceId: string, at: Date): NotificationDraft {
    return {
      recipientType: 'parent',
      recipientId: parentId,
      type: 'family_activity',
      title: `👨‍👩‍👧 ${title}`,
      body: `C’est demain à ${startTime.replace(':', 'h')}.`,
      icon: '👨‍👩‍👧',
      route: `/parent/rituals/occurrences/${occurrenceId}`,
      data: { occurrenceId },
      priority: 'low',
      channels: PUSH,
      entityType: 'ritual_occurrence',
      entityId: occurrenceId,
      dedupKey: `ritual_p1:${occurrenceId}`,
      scheduledAt: at,
    };
  },

  ritualSoon(child: ChildRef, title: string, startTime: string, occurrenceId: string, at: Date): NotificationDraft {
    const t = tone(child);
    return {
      recipientType: 'child',
      recipientId: child.id,
      type: 'family_activity',
      title: `👨‍👩‍👧 ${title}`,
      body: t === 'teen' ? `Ça commence à ${startTime.replace(':', 'h')}.` : `Ça commence à ${startTime.replace(':', 'h')} — on compte sur toi !`,
      icon: '👨‍👩‍👧',
      route: '/child/home',
      data: { occurrenceId },
      priority: 'normal',
      channels: PUSH,
      entityType: 'ritual_occurrence',
      entityId: occurrenceId,
      actorChildId: child.id,
      dedupKey: `ritual_c:${occurrenceId}:${child.id}`,
      scheduledAt: at,
    };
  },

  ritualThanks(child: ChildRef, title: string, points: number, occurrenceId: string): NotificationDraft {
    return {
      recipientType: 'child',
      recipientId: child.id,
      type: 'family_activity',
      title: '💛 Merci d’y avoir été',
      body: `+${points} points pour ${q(title)}.`,
      icon: '💛',
      route: '/child/points',
      data: { occurrenceId },
      priority: 'normal',
      channels: PUSH,
      entityType: 'ritual_occurrence',
      entityId: occurrenceId,
      actorChildId: child.id,
      dedupKey: `ritual_done:${occurrenceId}:${child.id}`,
    };
  },

  // ─── Progression & résumés ─────────────────────────────────────────────────

  goalCompleted(parentId: string, goalId: string, done: number): NotificationDraft {
    return {
      recipientType: 'parent',
      recipientId: parentId,
      type: 'goal_completed',
      title: '🔥 Objectif de la semaine atteint',
      body: `Votre famille a réalisé ${plural(done, 'activité')} hors écran cette semaine.`,
      icon: '🔥',
      route: '/parent/dashboard',
      data: { goalId, done },
      priority: 'normal',
      channels: PUSH,
      entityType: 'family_goal',
      entityId: goalId,
      dedupKey: `goal_done:${goalId}`,
    };
  },

  goalAlmost(parentId: string, goalId: string): NotificationDraft {
    return {
      recipientType: 'parent',
      recipientId: parentId,
      type: 'goal_progress',
      title: '🔥 Plus qu’une activité',
      body: 'Une seule activité et l’objectif familial de la semaine est atteint.',
      icon: '🔥',
      route: '/parent/dashboard',
      data: { goalId, remaining: 1 },
      priority: 'low',
      channels: PUSH,
      entityType: 'family_goal',
      entityId: goalId,
      dedupKey: `goal_almost:${goalId}`,
    };
  },

  dailySummary(parentId: string, lines: string[], pendingRewards: number, activities: number, day: string): NotificationDraft {
    const body = [...lines, ...(pendingRewards > 0 ? [`${plural(pendingRewards, 'récompense')} à valider`] : [])].join('\n');
    return {
      recipientType: 'parent',
      recipientId: parentId,
      type: 'daily_summary',
      title: '🌙 Aujourd’hui avec Rekonect',
      body,
      icon: '🌙',
      route: '/parent/dashboard',
      data: { activities, pendingRewards },
      priority: 'low',
      channels: PUSH,
      dedupKey: `daily_summary:${parentId}:${day}`,
    };
  },

  /** Récapitulatif hebdomadaire en push ; la version détaillée part par email (catalogue parent.weekly_report). */
  weeklySummary(parentId: string, count: number, minutes: number, week: string): NotificationDraft {
    const time = minutes > 0 ? ` et passé ${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')} hors écran` : '';
    return {
      recipientType: 'parent',
      recipientId: parentId,
      type: 'weekly_summary',
      title: '📊 Votre semaine avec Rekonect',
      body: `Vos enfants ont réalisé ${plural(count, 'activité')}${time}.`,
      icon: '📊',
      route: '/parent/dashboard?view=week',
      data: { activities: count, minutes },
      priority: 'low',
      channels: PUSH,
      dedupKey: `weekly:${parentId}:${week}`,
    };
  },

  screenTimeGoal(child: ChildRef, minutes: number, day: string): NotificationDraft {
    return {
      recipientType: 'parent',
      recipientId: child.parentId,
      type: 'screen_time_goal',
      title: '📱 Objectif atteint',
      body: `${child.displayName} a respecté son objectif de temps d’écran hier.`,
      icon: '📱',
      route: `/parent/children/${child.id}/screen-time`,
      data: { childId: child.id, minutes },
      priority: 'low',
      channels: PUSH,
      entityType: 'child',
      entityId: child.id,
      actorChildId: child.id,
      dedupKey: `st_goal:${child.id}:${day}`,
    };
  },

  screenTimeImproved(child: ChildRef, dropPercent: number, week: string): NotificationDraft {
    return {
      recipientType: 'parent',
      recipientId: child.parentId,
      type: 'screen_time_summary',
      title: '🌱 Belle progression',
      body: `${child.displayName} a réduit son temps d’écran de ${dropPercent} % cette semaine.`,
      icon: '🌱',
      route: `/parent/children/${child.id}/screen-time`,
      data: { childId: child.id, dropPercent },
      priority: 'low',
      channels: ['in_app'],
      entityType: 'child',
      entityId: child.id,
      actorChildId: child.id,
      dedupKey: `st_week:${child.id}:${week}`,
    };
  },

  // ─── Partenaires ───────────────────────────────────────────────────────────

  partnerOfferUnlocked(parentId: string, childName: string | null, offer: { title: string; partnerName: string }, claimId: string): NotificationDraft {
    return {
      recipientType: 'parent',
      recipientId: parentId,
      type: 'partner_offer_unlocked',
      title: `🎟️ Bon ${offer.partnerName} débloqué`,
      body: childName ? `Grâce aux activités de ${childName} : ${offer.title}.` : offer.title,
      icon: '🎟️',
      route: `/parent/offers/${claimId}`,
      data: { claimId },
      priority: 'normal',
      channels: PUSH,
      entityType: 'offer_claim',
      entityId: claimId,
      dedupKey: `offer:${claimId}`,
    };
  },

  paymentFailed(parentId: string, amountLabel: string, planName: string, invoiceId: string): NotificationDraft {
    return {
      recipientType: 'parent',
      recipientId: parentId,
      type: 'billing',
      title: '💳 Paiement refusé',
      body: `Votre paiement de ${amountLabel} n’a pas abouti. Mettez à jour votre moyen de paiement pour garder le plan ${planName}.`,
      icon: '💳',
      route: '/parent/subscription',
      data: { invoiceId },
      priority: 'high',
      channels: PUSH, // l'email détaillé part via le catalogue (parent.payment_failed)
      entityType: 'subscription',
      dedupKey: `payment_failed:${invoiceId}`,
    };
  },

  // ─── Séries & relances d'encouragement (moteur d'engagement) ───────────────
  // Toutes : priorité basse, ton selon l'âge, jamais de reproche. Plafonnées par EngagementService.

  streakMilestone(child: ChildRef, days: number, day: string): NotificationDraft {
    const t = tone(child);
    return {
      recipientType: 'child',
      recipientId: child.id,
      type: 'streak_milestone',
      title: t === 'teen' ? `🔥 ${days} jours d’affilée` : `🔥 ${days} jours de suite !`,
      body: t === 'young' ? `Tu fais une activité tous les jours depuis ${days} jours. Tu es trop fort !` : t === 'teen' ? `${days} jours avec au moins une activité hors écran. Belle régularité.` : `Une activité par jour depuis ${days} jours. Continue comme ça !`,
      icon: '🔥',
      route: '/child/points',
      data: { streak: days },
      priority: 'normal',
      channels: PUSH,
      entityType: 'child',
      entityId: child.id,
      actorChildId: child.id,
      dedupKey: `streak:${child.id}:${days}:${day}`,
    };
  },

  /** Série de parents : le parent voit aussi le cap (in-app seulement, pas de push). */
  streakMilestoneParent(child: ChildRef, days: number, day: string): NotificationDraft {
    return {
      recipientType: 'parent',
      recipientId: child.parentId,
      type: 'streak_milestone',
      title: `🔥 ${child.displayName} : ${days} jours de suite`,
      body: `${child.displayName} fait au moins une activité hors écran chaque jour depuis ${days} jours.`,
      icon: '🔥',
      route: `/parent/children/${child.id}`,
      data: { childId: child.id, streak: days },
      priority: 'low',
      channels: ['in_app'],
      entityType: 'child',
      entityId: child.id,
      actorChildId: child.id,
      dedupKey: `streak_parent:${child.id}:${days}:${day}`,
    };
  },

  nudge(child: ChildRef, n: NudgeCopyInput, day: string, at?: Date | null): NotificationDraft {
    const copy = nudgeCopy(tone(child), n);
    return {
      recipientType: 'child',
      recipientId: child.id,
      type: n.kind,
      title: copy.title,
      body: copy.body,
      icon: copy.icon,
      route: copy.route,
      data: { ...n, childId: child.id },
      priority: 'low',
      channels: PUSH,
      entityType: 'child',
      entityId: child.id,
      actorChildId: child.id,
      // Une relance par enfant et par jour, quel que soit son type.
      dedupKey: `nudge:${child.id}:${day}`,
      scheduledAt: at ?? null,
    };
  },

  parentNudgeIdle(parentId: string, child: ChildRef, days: number, idea: { title: string } | null, week: string): NotificationDraft {
    return {
      recipientType: 'parent',
      recipientId: parentId,
      type: 'parent_nudge_idle',
      title: `💡 Une idée pour ${child.displayName} ?`,
      body: idea
        ? `Pas d’activité depuis ${days} jours. Et pourquoi pas ${q(idea.title)} ? Quelques minutes suffisent pour relancer l’envie.`
        : `Pas d’activité depuis ${days} jours. Proposer une activité courte suffit souvent à relancer l’envie.`,
      icon: '💡',
      route: `/parent/children/${child.id}/assign`,
      data: { childId: child.id, days },
      priority: 'low',
      channels: PUSH,
      entityType: 'child',
      entityId: child.id,
      actorChildId: child.id,
      dedupKey: `parent_idle:${child.id}:${week}`,
    };
  },

  validationBacklog(parentId: string, count: number, oldestChild: string, day: string): NotificationDraft {
    return {
      recipientType: 'parent',
      recipientId: parentId,
      type: 'validation_backlog',
      title: count > 1 ? `👀 ${count} activités attendent votre validation` : `👀 ${oldestChild} attend votre validation`,
      body: count > 1 ? `Vos enfants attendent leurs points. Un petit passage suffit.` : `Son activité est terminée depuis hier : validez-la pour qu’il reçoive ses points.`,
      icon: '👀',
      route: '/parent/validations',
      data: { count },
      priority: 'normal',
      channels: PUSH,
      dedupKey: `validation_backlog:${parentId}:${day}`,
    };
  },

  groupSummary(type: string, count: number): { title: string; body: string } {
    if (type === 'activity_completed') return { title: '🎉 Belle journée', body: `Vos enfants ont terminé ${count} activités aujourd’hui.` };
    if (type === 'activity_validation_required') return { title: `👀 ${count} activités à valider`, body: 'Vos enfants attendent votre validation.' };
    return { title: `${count} nouvelles notifications`, body: '' };
  },
};

// ─── Textes des relances d'encouragement ─────────────────────────────────────

export type NudgeCopyInput =
  | { kind: 'nudge_resume'; activityTitle: string; childActivityId: string }
  | { kind: 'nudge_streak'; streak: number }
  | { kind: 'nudge_reward_close'; rewardTitle: string; missing: number }
  | { kind: 'nudge_comeback'; activityTitle: string; days: number; categoryIcon: string | null; activityId: string }
  | { kind: 'nudge_idle'; days: number; suggestion: { id: string; title: string; minutes: number | null } | null }
  | { kind: 'nudge_goal'; remaining: number };

/** Formulations par tranche d'âge : chaleureuses pour les petits, sobres pour les ados, jamais culpabilisantes. */
export function nudgeCopy(t: AgeTone, n: NudgeCopyInput): { title: string; body: string; icon: string; route: string } {
  switch (n.kind) {
    case 'nudge_resume':
      return {
        icon: '▶️',
        route: `/child/activities/${n.childActivityId}`,
        title: t === 'teen' ? 'On reprend ?' : '▶️ On continue ?',
        body: t === 'young' ? `Tu avais commencé ${q(n.activityTitle)}. On la termine ensemble ?` : `Tu avais commencé ${q(n.activityTitle)}. Tu veux reprendre ?`,
      };
    case 'nudge_streak':
      return {
        icon: '🔥',
        route: '/child/activities',
        title: t === 'teen' ? `🔥 Série de ${n.streak} jours` : `🔥 Ta série de ${n.streak} jours t’attend`,
        body: t === 'young' ? 'Une petite activité aujourd’hui et ta série continue !' : t === 'teen' ? 'Une activité aujourd’hui pour la garder, même courte.' : 'Une activité aujourd’hui et ta série continue. Même 10 minutes, ça compte !',
      };
    case 'nudge_reward_close':
      return {
        icon: '🎁',
        route: '/child/rewards',
        title: t === 'teen' ? `Plus que ${n.missing} points` : `🎁 Plus que ${n.missing} points !`,
        body: t === 'young' ? `Encore un effort et tu débloques ${q(n.rewardTitle)} 👀` : `${q(n.rewardTitle)} est à portée de main.`,
      };
    case 'nudge_comeback': {
      const icon = n.categoryIcon ?? '✨';
      return {
        icon,
        route: `/child/activities?activity=${n.activityId}`,
        title: t === 'teen' ? `${icon} ${n.activityTitle}, ça te dit ?` : `${icon} Ça fait longtemps !`,
        body:
          t === 'young'
            ? `Tu n’as pas fait ${q(n.activityTitle)} depuis ${n.days} jours. On s’y remet aujourd’hui ?`
            : t === 'teen'
              ? `Pas de ${q(n.activityTitle)} depuis ${n.days} jours. Un créneau aujourd’hui ?`
              : `Ça fait ${n.days} jours que tu n’as pas fait ${q(n.activityTitle)}. Et si tu t’y remettais aujourd’hui ?`,
      };
    }
    case 'nudge_idle':
      return {
        icon: '🌱',
        route: n.suggestion ? `/child/activities?activity=${n.suggestion.id}` : '/child/activities',
        title: t === 'teen' ? 'Une pause hors écran ?' : '🌱 Et si tu faisais une pause ?',
        body: n.suggestion
          ? `On a trouvé ${q(n.suggestion.title)}${n.suggestion.minutes ? ` (${n.suggestion.minutes} min)` : ''} pour toi.`
          : t === 'young'
            ? 'Choisis une activité et gagne des points !'
            : 'Choisis une activité : quelques minutes suffisent.',
      };
    case 'nudge_goal':
      return {
        icon: '🔥',
        route: '/child/activities',
        title: t === 'teen' ? 'Objectif de la semaine' : '🔥 Presque !',
        body: n.remaining <= 1 ? 'Plus qu’une activité pour l’objectif de la famille cette semaine.' : `Plus que ${n.remaining} activités pour l’objectif de la famille.`,
      };
  }
}
