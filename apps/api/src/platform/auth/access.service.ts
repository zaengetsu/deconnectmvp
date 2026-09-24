import { Injectable } from '@nestjs/common';
import type { PartnerMemberRole } from '@rekonect/contracts';
import { forbidden, notFound } from '../http/errors';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import type { ChildPrincipal, Principal, UserPrincipal } from './principal';

/** « reception » ne sert qu'à valider des bons : c'est le rang le plus bas. */
export const PARTNER_ROLE_RANK: Record<PartnerMemberRole, number> = { reception: 0, viewer: 1, editor: 2, owner: 3 };

/**
 * Règles d'accès aux données (ex-policies RLS), centralisées et testées.
 * Un enfant inexistant et un enfant d'une autre famille renvoient la même erreur 404 :
 * on ne révèle pas l'existence de données d'autres familles.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  requireParent(p: Principal): UserPrincipal {
    if (p.kind !== 'user' || p.role !== 'parent') throw forbidden('PARENT_ONLY', 'Réservé aux parents');
    return p;
  }

  requireChild(p: Principal): ChildPrincipal {
    if (p.kind !== 'child') throw forbidden('CHILD_ONLY', 'Réservé à la session enfant');
    return p;
  }

  /** L'enfant appartient au parent connecté, ou c'est la session de cet enfant. */
  async assertCanReadChild(p: Principal, childId: string, db: Tx | PrismaService = this.prisma) {
    if (p.kind === 'child') {
      if (p.childId !== childId) throw notFound('CHILD_NOT_FOUND', 'Enfant introuvable');
      return this.loadChild(childId, db);
    }
    return this.assertParentOwnsChild(p.userId, childId, db);
  }

  async assertParentOwnsChild(parentId: string, childId: string, db: Tx | PrismaService = this.prisma) {
    const child = await db.child.findFirst({ where: { id: childId, parentId } });
    if (!child) throw notFound('CHILD_NOT_FOUND', 'Enfant introuvable');
    return child;
  }

  private async loadChild(childId: string, db: Tx | PrismaService) {
    const child = await db.child.findFirst({ where: { id: childId, isActive: true } });
    if (!child) throw notFound('CHILD_NOT_FOUND', 'Enfant introuvable');
    return child;
  }

  /**
   * Membre actif d'un partenaire, avec au moins le rôle demandé.
   * Les membres d'une enseigne accèdent aussi à ses magasins rattachés, avec le même rôle.
   */
  async assertPartnerMember(p: Principal, partnerId: string, minRole: PartnerMemberRole = 'viewer'): Promise<{ role: PartnerMemberRole; via: 'direct' | 'network' | 'admin' }> {
    if (p.kind !== 'user') throw forbidden();
    if (p.role === 'admin') return { role: 'owner', via: 'admin' };
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId }, select: { status: true, parentPartnerId: true } });
    if (!partner) throw notFound('PARTNER_NOT_FOUND', 'Partenaire introuvable');
    const memberships = await this.prisma.partnerMember.findMany({
      where: { userId: p.userId, status: 'active', partnerId: { in: [partnerId, ...(partner.parentPartnerId ? [partner.parentPartnerId] : [])] } },
    });
    const direct = memberships.find((m) => m.partnerId === partnerId);
    const network = memberships.find((m) => m.partnerId === partner.parentPartnerId);
    const member = direct ?? (network && network.role !== 'reception' ? network : undefined);
    if (!member) throw notFound('PARTNER_NOT_FOUND', 'Partenaire introuvable');
    if (partner.status === 'suspended') throw forbidden('PARTNER_SUSPENDED', 'Ce compte partenaire est suspendu');
    const role = member.role as PartnerMemberRole;
    if (PARTNER_ROLE_RANK[role] < PARTNER_ROLE_RANK[minRole]) throw forbidden('PARTNER_ROLE', 'Votre rôle ne permet pas cette action');
    return { role, via: direct ? 'direct' : 'network' };
  }
}
