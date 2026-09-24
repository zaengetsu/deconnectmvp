import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { UserRole } from '@rekonect/contracts';

export interface UserPrincipal {
  kind: 'user';
  userId: string;
  role: UserRole;
}

export interface ChildPrincipal {
  kind: 'child';
  childId: string;
  parentId: string;
}

export type Principal = UserPrincipal | ChildPrincipal;

/** Revendications du jeton d'accès (JWT HS256, courte durée). */
export interface AccessClaims {
  sub: string;
  kind: 'user' | 'child';
  role?: UserRole;
  pid?: string;
}

export function principalFromClaims(claims: AccessClaims): Principal {
  if (claims.kind === 'child') return { kind: 'child', childId: claims.sub, parentId: claims.pid ?? '' };
  return { kind: 'user', userId: claims.sub, role: claims.role ?? 'parent' };
}

export const IS_PUBLIC = 'rk:public';
export const ROLES = 'rk:roles';

/** Route accessible sans authentification. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restreint l'accès : rôles utilisateur et/ou « child » pour une session enfant. */
export type Audience = UserRole | 'child';
export const Allow = (...audiences: Audience[]) => SetMetadata(ROLES, audiences);

export const CurrentPrincipal = createParamDecorator((_: unknown, ctx: ExecutionContext): Principal => {
  return ctx.switchToHttp().getRequest().principal;
});

export function actorOf(p: Principal): { kind: 'parent' | 'child' | 'partner' | 'admin'; id: string } {
  return p.kind === 'child' ? { kind: 'child', id: p.childId } : { kind: p.role, id: p.userId };
}
