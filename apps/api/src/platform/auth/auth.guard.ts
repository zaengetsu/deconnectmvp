import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { forbidden, unauthorized } from '../http/errors';
import { PrismaService } from '../prisma/prisma.service';
import { type Audience, IS_PUBLIC, type Principal, ROLES } from './principal';
import { TokenVerifier } from './token-verifier';

/**
 * Garde globale : toute route est authentifiée sauf @Public().
 * Remplace les policies RLS : l'autorisation fine (propriété d'un enfant, membre d'un partenaire)
 * est vérifiée ensuite dans les services via AccessService.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly verifier: TokenVerifier,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw unauthorized();

    const principal = await this.verifier.verify(token);
    if (!principal) throw unauthorized('TOKEN_INVALID', 'Session expirée, reconnectez-vous');
    req.principal = principal;

    const audiences = this.reflector.getAllAndOverride<Audience[] | undefined>(ROLES, targets);
    if (audiences?.length) {
      const audience: Audience = principal.kind === 'child' ? 'child' : principal.role;
      if (!audiences.includes(audience)) {
        if (!audiences.includes('admin') || !(await this.isBackofficeAdmin(principal))) throw forbidden();
        // Les services lisent aussi le rôle (AccessService, actorOf) : admin pour cette requête seulement.
        req.principal = { ...principal, role: 'admin' };
      }
    }
    return true;
  }

  /** Lu en base à chaque fois : retirer le statut coupe l'accès sans attendre l'expiration du jeton. */
  private async isBackofficeAdmin(principal: Principal): Promise<boolean> {
    if (principal.kind !== 'user') return false;
    const user = await this.prisma.user.findUnique({ where: { id: principal.userId }, select: { isAdmin: true } });
    return !!user?.isAdmin;
  }
}
