import { Injectable } from '@nestjs/common';
import { levelForPoints, pointsToNextLevel } from '@rekonect/contracts';
import { AccessService } from '../../platform/auth/access.service';
import type { Principal } from '../../platform/auth/principal';
import { Clock } from '../../platform/clock';
import { conflict } from '../../platform/http/errors';
import { PrismaService, type Tx } from '../../platform/prisma/prisma.service';
import { addDays, dateColumnToIso, isoToDateColumn, localDateString } from '../../platform/time';

export type LedgerSource = 'activity_validation' | 'reward_redemption' | 'manual_adjustment' | 'bonus';

export interface AwardResult {
  points: number;
  newTotal: number;
  oldLevel: number;
  newLevel: number;
  levelUp: boolean;
  badgesAwarded: number;
}

/**
 * Points, niveaux, badges et séries. Ces opérations sont exposées aux autres modules
 * en appel synchrone DANS leur transaction : un point ne peut pas être crédité sans l'action
 * qui le justifie (parité avec validate_child_activity / approve_reward_request).
 */
@Injectable()
export class GamificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly clock: Clock,
  ) {}

  async award(
    tx: Tx,
    input: { childId: string; points: number; source: LedgerSource; sourceId?: string | null; reason: string; createdBy?: string | null },
  ): Promise<AwardResult> {
    const child = await tx.child.findUniqueOrThrow({ where: { id: input.childId } });
    await tx.pointsLedger.create({
      data: {
        childId: input.childId,
        sourceType: input.source,
        sourceId: input.sourceId ?? null,
        points: input.points,
        reason: input.reason,
        createdBy: input.createdBy ?? null,
      },
    });
    const newTotal = child.totalPoints + input.points;
    const newLevel = levelForPoints(newTotal);
    await tx.child.update({ where: { id: child.id }, data: { totalPoints: newTotal, level: newLevel } });
    const badgesAwarded = await this.checkBadges(tx, child.id, newTotal);
    return {
      points: input.points,
      newTotal,
      oldLevel: child.level,
      newLevel,
      levelUp: newLevel > child.level,
      badgesAwarded,
    };
  }

  /** Débit de points (récompense). Le niveau n'est jamais rétrogradé. */
  async spend(
    tx: Tx,
    input: { childId: string; points: number; sourceId: string; reason: string; createdBy: string },
  ): Promise<number> {
    // Verrou de ligne : deux approbations simultanées ne peuvent pas passer sous zéro.
    const [row] = await tx.$queryRaw<{ total_points: number }[]>`
      SELECT total_points FROM children WHERE id = ${input.childId}::uuid FOR UPDATE`;
    if (!row || row.total_points < input.points) {
      throw conflict('NOT_ENOUGH_POINTS', "L'enfant n'a pas assez de points pour cette récompense");
    }
    await tx.pointsLedger.create({
      data: {
        childId: input.childId,
        sourceType: 'reward_redemption',
        sourceId: input.sourceId,
        points: -input.points,
        reason: input.reason,
        createdBy: input.createdBy,
      },
    });
    const updated = await tx.child.update({
      where: { id: input.childId },
      data: { totalPoints: { decrement: input.points } },
      select: { totalPoints: true },
    });
    return updated.totalPoints;
  }

  async checkBadges(tx: Tx, childId: string, totalPoints: number): Promise<number> {
    const [validated, badges, owned] = await Promise.all([
      tx.childActivity.count({ where: { childId, status: 'validated' } }),
      tx.badge.findMany(),
      tx.childBadge.findMany({ where: { childId }, select: { badgeId: true } }),
    ]);
    const ownedIds = new Set(owned.map((b) => b.badgeId));
    const earned = badges.filter(
      (b) =>
        !ownedIds.has(b.id) &&
        ((b.conditionType === 'activities_validated' && validated >= b.conditionValue) ||
          (b.conditionType === 'points_earned' && totalPoints >= b.conditionValue)),
    );
    if (earned.length === 0) return 0;
    const res = await tx.childBadge.createMany({
      data: earned.map((b) => ({ childId, badgeId: b.id })),
      skipDuplicates: true,
    });
    return res.count;
  }

  /** Série de jours consécutifs, dans le fuseau de la famille (parité avec update_child_streak). */
  async touchStreak(tx: Tx, childId: string, timeZone: string): Promise<number> {
    const child = await tx.child.findUniqueOrThrow({ where: { id: childId } });
    const today = localDateString(this.clock.now(), timeZone);
    const last = dateColumnToIso(child.lastActivityDate);
    if (last === today) return child.streakDays;
    const streak = last === addDays(today, -1) ? child.streakDays + 1 : 1;
    await tx.child.update({
      where: { id: childId },
      data: { streakDays: streak, lastActivityDate: isoToDateColumn(today) },
    });
    return streak;
  }

  async summary(p: Principal, childId: string) {
    const child = await this.access.assertCanReadChild(p, childId);
    const [badges, ledger] = await Promise.all([
      this.prisma.childBadge.findMany({ where: { childId }, include: { badge: true }, orderBy: { earnedAt: 'desc' } }),
      this.prisma.pointsLedger.findMany({ where: { childId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);
    return {
      childId,
      totalPoints: child.totalPoints,
      level: child.level,
      pointsToNextLevel: pointsToNextLevel(child.totalPoints),
      streakDays: child.streakDays,
      badges: badges.map((b) => ({
        id: b.badge.id,
        name: b.badge.name,
        description: b.badge.description,
        icon: b.badge.icon,
        earnedAt: b.earnedAt,
      })),
      ledger: ledger.map((l) => ({ id: l.id, points: l.points, reason: l.reason, source: l.sourceType, createdAt: l.createdAt })),
    };
  }

  async stats(p: Principal, childId: string, since: Date | null) {
    await this.access.assertCanReadChild(p, childId);
    const from = since ?? new Date(this.clock.now().getTime() - 7 * 86_400_000);
    const [earned, spent, validated, recent, weekPoints, badges] = await Promise.all([
      this.prisma.pointsLedger.aggregate({ where: { childId, points: { gt: 0 } }, _sum: { points: true } }),
      this.prisma.pointsLedger.aggregate({ where: { childId, points: { lt: 0 } }, _sum: { points: true } }),
      this.prisma.childActivity.count({ where: { childId, status: 'validated' } }),
      this.prisma.childActivity.findMany({
        where: { childId, status: 'validated', validatedAt: { gte: from } },
        select: { validatedAt: true, earnedPoints: true },
        orderBy: { validatedAt: 'asc' },
      }),
      this.prisma.pointsLedger.aggregate({ where: { childId, sourceType: 'activity_validation', createdAt: { gte: from } }, _sum: { points: true } }),
      this.prisma.childBadge.count({ where: { childId, earnedAt: { gte: from } } }),
    ]);
    return {
      totalEarned: earned._sum.points ?? 0,
      totalSpent: Math.abs(spent._sum.points ?? 0),
      activitiesValidated: validated,
      since: from,
      recent: { validated: recent, pointsEarned: weekPoints._sum.points ?? 0, badgesEarned: badges },
    };
  }

  listBadges() {
    return this.prisma.badge.findMany({ orderBy: [{ conditionType: 'asc' }, { conditionValue: 'asc' }] });
  }
}
