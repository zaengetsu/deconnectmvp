import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { forbidden, unauthorized } from '../http/errors';
import { type Audience, IS_PUBLIC, ROLES } from './principal';
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
      if (!audiences.includes(audience)) throw forbidden();
    }
    return true;
  }
}
