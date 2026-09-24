import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PartnerLeadInput, PartnerLeadStatus } from '@rekonect/contracts';
import { ENV, type Env } from '../../config/env';
import type { UserPrincipal } from '../../platform/auth/principal';
import { Clock } from '../../platform/clock';
import { notFound } from '../../platform/http/errors';
import { Mailer } from '../../platform/mail/mailer';
import { mails } from '../../platform/mail/templates';
import { PrismaService } from '../../platform/prisma/prisma.service';

/** Au-delà, les nouvelles demandes d'une même adresse sur 24 h sont ignorées (sans erreur visible). */
export const LEADS_PER_EMAIL_PER_DAY = 3;

export const LEAD_KIND_LABELS: Record<string, string> = {
  store: 'Magasin',
  brand: 'Enseigne',
  public_institution: 'Collectivité',
  cse: 'CSE',
};

/**
 * Demandes de contact de la landing partenaires. Public, donc prudent :
 * piège à robots, limite par adresse, et toujours la même réponse pour ne
 * rien révéler de ce qui a été enregistré.
 */
@Injectable()
export class PartnerLeadsService {
  private readonly logger = new Logger('PartnerLeads');

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async submit(input: PartnerLeadInput): Promise<{ received: true }> {
    if (input.website) return { received: true };
    const now = this.clock.now();
    const recent = await this.prisma.partnerLead.count({ where: { email: input.email, createdAt: { gte: new Date(now.getTime() - 86_400_000) } } });
    if (recent >= LEADS_PER_EMAIL_PER_DAY) return { received: true };

    const lead = await this.prisma.partnerLead.create({
      data: { fullName: input.fullName, organization: input.organization, email: input.email, kind: input.kind, message: input.message || null, createdAt: now },
    });
    const ack = await this.mailer.send(mails.partnerLeadReceived(lead.email, lead.fullName));
    if (ack.status === 'failed') this.logger.warn(`Accusé de réception non envoyé à ${lead.email} : ${ack.error}`);
    if (this.env.PARTNER_LEADS_EMAIL) {
      const admin = `${this.env.WEB_ADMIN_URL.replace(/\/$/, '')}/partners?tab=leads`;
      const res = await this.mailer.send(mails.partnerLeadInternal(this.env.PARTNER_LEADS_EMAIL, { ...lead, kindLabel: LEAD_KIND_LABELS[lead.kind] ?? lead.kind }, admin));
      if (res.status === 'failed') this.logger.warn(`Alerte équipe non envoyée : ${res.error}`);
    }
    return { received: true };
  }

  async list(status?: PartnerLeadStatus) {
    const [rows, grouped] = await Promise.all([
      this.prisma.partnerLead.findMany({ where: status ? { status } : undefined, orderBy: { createdAt: 'desc' }, take: 200 }),
      this.prisma.partnerLead.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count._all])) as Record<string, number>;
    return { items: rows.map((r) => ({ ...r, kindLabel: LEAD_KIND_LABELS[r.kind] ?? r.kind })), counts };
  }

  async setStatus(p: UserPrincipal, id: string, status: PartnerLeadStatus) {
    const lead = await this.prisma.partnerLead.findUnique({ where: { id } });
    if (!lead) throw notFound('LEAD_NOT_FOUND', 'Demande introuvable');
    const updated = await this.prisma.partnerLead.update({
      where: { id },
      data: { status, handledBy: status === 'new' ? null : p.userId, handledAt: status === 'new' ? null : this.clock.now() },
    });
    return { ...updated, kindLabel: LEAD_KIND_LABELS[updated.kind] ?? updated.kind };
  }
}
