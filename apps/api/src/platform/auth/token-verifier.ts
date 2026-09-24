import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ENV, type Env } from '../../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { type AccessClaims, type Principal, principalFromClaims } from './principal';

interface SupabaseClaims {
  sub: string;
  role?: string;
  is_anonymous?: boolean;
  iss?: string;
}

/**
 * Vérifie un jeton d'accès : d'abord ceux de l'API, puis — pendant la migration — ceux de Supabase Auth
 * (l'app mobile peut ainsi appeler l'API sans attendre la bascule de l'authentification).
 */
@Injectable()
export class TokenVerifier {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async verify(token: string): Promise<Principal | null> {
    try {
      return principalFromClaims(await this.jwt.verifyAsync<AccessClaims>(token));
    } catch {
      return this.env.SUPABASE_JWT_SECRET ? this.verifySupabase(token) : null;
    }
  }

  private async verifySupabase(token: string): Promise<Principal | null> {
    let claims: SupabaseClaims;
    try {
      claims = await this.jwt.verifyAsync<SupabaseClaims>(token, { secret: this.env.SUPABASE_JWT_SECRET, algorithms: ['HS256'] });
    } catch {
      return null;
    }
    if (!claims.sub || claims.role !== 'authenticated') return null;
    if (claims.is_anonymous) {
      // Session anonyme de l'appareil enfant (migration 024) : rattachée à children.auth_user_id.
      const child = await this.prisma.child.findFirst({ where: { authUserId: claims.sub, isActive: true }, select: { id: true, parentId: true } });
      return child ? { kind: 'child', childId: child.id, parentId: child.parentId } : null;
    }
    const user = await this.prisma.user.findUnique({ where: { id: claims.sub }, select: { role: true, disabledAt: true } });
    if (user?.disabledAt) return null;
    const profile = user ? null : await this.prisma.profile.findUnique({ where: { id: claims.sub }, select: { role: true } });
    const role = (user?.role ?? profile?.role ?? 'parent') as 'parent' | 'admin' | 'partner';
    return { kind: 'user', userId: claims.sub, role };
  }
}
