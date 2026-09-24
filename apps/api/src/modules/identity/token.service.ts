import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ENV, type Env } from '../../config/env';
import type { AccessClaims } from '../../platform/auth/principal';
import { Clock } from '../../platform/clock';
import { randomToken, sha256 } from '../../platform/crypto';
import { unauthorized } from '../../platform/http/errors';
import { PrismaService, type Tx } from '../../platform/prisma/prisma.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

type Subject = { userId: string; role: 'parent' | 'admin' | 'partner' } | { childId: string; parentId: string };

/**
 * Jetons d'accès courts (JWT) + refresh tokens opaques, rotatifs et révocables.
 * Réutilisation d'un refresh déjà consommé = vol probable → toute la famille de jetons est révoquée.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async issue(subject: Subject, meta: { deviceId?: string | null; userAgent?: string | null } = {}, db: Tx | PrismaService = this.prisma, familyId: string = randomUUID()): Promise<TokenPair & { id: string }> {
    const claims: AccessClaims =
      'userId' in subject
        ? { sub: subject.userId, kind: 'user', role: subject.role }
        : { sub: subject.childId, kind: 'child', pid: subject.parentId };
    const accessToken = await this.jwt.signAsync(claims);
    const refreshToken = randomToken(48);
    const ttlDays = 'childId' in subject ? this.env.CHILD_REFRESH_TTL_DAYS : this.env.REFRESH_TTL_DAYS;
    const row = await db.refreshToken.create({
      data: {
        userId: 'userId' in subject ? subject.userId : null,
        childId: 'childId' in subject ? subject.childId : null,
        tokenHash: sha256(refreshToken),
        familyId,
        deviceId: meta.deviceId ?? null,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
        expiresAt: new Date(this.clock.now().getTime() + ttlDays * 86_400_000),
      },
      select: { id: true },
    });
    return { id: row.id, accessToken, refreshToken, expiresIn: this.env.JWT_ACCESS_TTL_SECONDS };
  }

  async rotate(refreshToken: string, userAgent?: string | null): Promise<TokenPair> {
    const now = this.clock.now();
    const result = await this.prisma.tx(async (tx): Promise<TokenPair | { reused: string }> => {
      const current = await tx.refreshToken.findUnique({
        where: { tokenHash: sha256(refreshToken) },
        include: { user: true, child: true },
      });
      if (!current) throw unauthorized('REFRESH_INVALID', 'Session expirée, reconnectez-vous');

      // Jeton déjà consommé : vol probable. La révocation doit survivre à l'erreur (hors transaction).
      if (current.revokedAt) return { reused: current.familyId };
      if (current.expiresAt <= now) throw unauthorized('REFRESH_EXPIRED', 'Session expirée, reconnectez-vous');

      let subject: Subject;
      if (current.user) {
        if (current.user.disabledAt) throw unauthorized('ACCOUNT_DISABLED', 'Ce compte est désactivé');
        subject = { userId: current.user.id, role: current.user.role as 'parent' | 'admin' | 'partner' };
      } else if (current.child && current.child.isActive) {
        subject = { childId: current.child.id, parentId: current.child.parentId };
      } else {
        throw unauthorized('REFRESH_INVALID', 'Session expirée, reconnectez-vous');
      }

      const next = await this.issue(subject, { deviceId: current.deviceId, userAgent }, tx, current.familyId);
      await tx.refreshToken.update({ where: { id: current.id }, data: { revokedAt: now, replacedBy: next.id } });
      return { accessToken: next.accessToken, refreshToken: next.refreshToken, expiresIn: next.expiresIn };
    });
    if ('reused' in result) {
      await this.prisma.refreshToken.updateMany({ where: { familyId: result.reused, revokedAt: null }, data: { revokedAt: now } });
      throw unauthorized('REFRESH_REUSED', 'Session expirée, reconnectez-vous');
    }
    return result;
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: this.clock.now() },
    });
  }

  async revokeAllForUser(userId: string, db: Tx | PrismaService = this.prisma): Promise<number> {
    const res = await db.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: this.clock.now() } });
    return res.count;
  }

  async revokeAllForChild(childId: string, db: Tx | PrismaService = this.prisma): Promise<number> {
    const res = await db.refreshToken.updateMany({ where: { childId, revokedAt: null }, data: { revokedAt: this.clock.now() } });
    return res.count;
  }
}
