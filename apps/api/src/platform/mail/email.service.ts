import { createHmac } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../../config/env';
import { Clock } from '../clock';
import { safeEqual } from '../crypto';
import { Prisma, PrismaService, type Tx } from '../prisma/prisma.service';
import { CATEGORY_LABELS, type EmailCategory, type EmailData, EMAILS, type EmailTemplateId, type EmailUrls, UNSUBSCRIBABLE } from './catalog';
import { renderEmail } from './layout';
import { Mailer } from './mailer';

type Db = Tx | PrismaService;

export interface QueueInput<T extends EmailTemplateId> {
  to: string;
  toName?: string | null;
  data: EmailData<T>;
  /** Clé d'idempotence : le même email n'est jamais envoyé deux fois (rejeu d'événement, job relancé). */
  dedupKey?: string | null;
  recipientId?: string | null;
  sendAt?: Date | null;
}

export type QueueResult = { id: string; status: 'pending' | 'suppressed' } | { id: null; status: 'duplicate' | 'invalid' };

/** Délais entre deux tentatives (erreurs temporaires du fournisseur). */
export const EMAIL_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000];

const REASONS: Record<string, string> = {
  parent: 'Vous recevez cet email car vous avez un compte parent Rekonect.',
  partner: 'Vous recevez cet email car vous faites partie d’un compte partenaire Rekonect.',
  admin: 'Vous recevez cet email car vous faites partie de l’équipe Rekonect.',
  any: 'Vous recevez cet email car vous avez un compte Rekonect.',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Emails automatiques : file persistante (email_messages) plutôt qu'envoi direct.
 * - écrit dans la transaction métier : pas d'email pour une action annulée ;
 * - idempotent (dedup_key) ; reprises avec délais croissants ; journal consultable ;
 * - désinscription par catégorie (lien signé + en-têtes List-Unsubscribe en un clic).
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger('Emails');

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly mailer: Mailer,
    @Inject(ENV) private readonly env: Env,
  ) {}

  get urls(): EmailUrls {
    return { app: this.env.MOBILE_APP_URL, partners: this.env.WEB_PARTNERS_URL, admin: this.env.WEB_ADMIN_URL };
  }

  async queue<T extends EmailTemplateId>(db: Db, template: T, input: QueueInput<T>): Promise<QueueResult> {
    const email = input.to.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return { id: null, status: 'invalid' };
    const def = EMAILS[template];
    const render = def.render as (d: EmailData<T>, u: EmailUrls) => { subject: string };
    const subject = render(input.data, this.urls).subject;
    const suppressed = await this.isSuppressed(db, email, def.category);
    const now = this.clock.now();
    const rows = await db.emailMessage.createManyAndReturn({
      data: [
        {
          template,
          category: def.category,
          audience: def.audience,
          toEmail: email,
          toName: input.toName ?? null,
          subject,
          data: input.data as Prisma.InputJsonValue,
          recipientId: input.recipientId ?? null,
          dedupKey: input.dedupKey ?? null,
          status: suppressed ? 'suppressed' : 'pending',
          nextAttemptAt: input.sendAt ?? now,
          createdAt: now,
        },
      ],
      skipDuplicates: true,
      select: { id: true },
    });
    if (rows.length === 0) return { id: null, status: 'duplicate' };
    if (!suppressed) await db.$executeRaw`SELECT pg_notify('emails', ${rows[0].id})`;
    return { id: rows[0].id, status: suppressed ? 'suppressed' : 'pending' };
  }

  /** Emails de sécurité (lien de réinitialisation…) : mis en file puis tentés immédiatement. */
  async sendNow<T extends EmailTemplateId>(template: T, input: QueueInput<T>): Promise<QueueResult> {
    const res = await this.queue(this.prisma, template, input);
    if (res.id && res.status === 'pending') await this.processOne(res.id);
    return res;
  }

  /** Traite les emails échus ; renvoie le nombre de messages traités. */
  async processPending(limit = 50): Promise<number> {
    const due = await this.prisma.emailMessage.findMany({
      where: { status: 'pending', nextAttemptAt: { lte: this.clock.now() } },
      orderBy: { nextAttemptAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    for (const { id } of due) await this.processOne(id);
    return due.length;
  }

  private async processOne(id: string): Promise<void> {
    // Réservation : un seul worker envoie un message donné (pas de double envoi entre réplicas).
    const claimed = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE email_messages SET attempts = attempts + 1, next_attempt_at = ${new Date(this.clock.now().getTime() + 10 * 60_000)}
      WHERE id = ${id}::uuid AND status = 'pending' AND next_attempt_at <= ${this.clock.now()}
      RETURNING id`;
    if (claimed.length === 0) return;
    const row = await this.prisma.emailMessage.findUniqueOrThrow({ where: { id } });
    const def = EMAILS[row.template as EmailTemplateId];
    if (!def) {
      await this.prisma.emailMessage.update({ where: { id }, data: { status: 'failed', lastError: `unknown_template:${row.template}` } });
      return;
    }
    if (await this.isSuppressed(this.prisma, row.toEmail, def.category as EmailCategory)) {
      await this.prisma.emailMessage.update({ where: { id }, data: { status: 'suppressed' } });
      return;
    }

    const content = (def.render as (d: unknown, u: EmailUrls) => ReturnType<typeof def.render>)(row.data, this.urls);
    const unsubscribeUrl = UNSUBSCRIBABLE.includes(def.category) ? this.unsubscribeUrl(row.toEmail, def.category) : null;
    const { html, text } = renderEmail(content, { reason: REASONS[def.audience], unsubscribeUrl });
    const headers: Record<string, string> = { 'X-Rekonect-Template': row.template };
    if (unsubscribeUrl) {
      headers['List-Unsubscribe'] = `<${unsubscribeUrl}>`;
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }

    const res = await this.mailer.send({ to: row.toEmail, toName: row.toName, subject: content.subject, html, text, tags: [row.template, def.category], headers });
    const now = this.clock.now();
    if (res.status === 'sent') {
      await this.prisma.emailMessage.update({ where: { id }, data: { status: 'sent', sentAt: now, providerId: res.id ?? null, lastError: null } });
    } else if (res.status === 'skipped') {
      await this.prisma.emailMessage.update({ where: { id }, data: { status: 'skipped', lastError: res.reason } });
    } else {
      const delay = EMAIL_RETRY_DELAYS_MS[row.attempts - 1];
      const retry = res.retryable && delay !== undefined;
      await this.prisma.emailMessage.update({
        where: { id },
        data: retry ? { lastError: res.error, nextAttemptAt: new Date(now.getTime() + delay) } : { status: 'failed', lastError: res.error },
      });
      if (!retry) this.logger.warn(`Email ${row.template} → ${row.toEmail} en échec : ${res.error}`);
    }
  }

  // ─── Désinscription ────────────────────────────────────────────────────────

  private async isSuppressed(db: Db, email: string, category: EmailCategory): Promise<boolean> {
    if (!UNSUBSCRIBABLE.includes(category)) return false;
    const row = await db.emailSuppression.findUnique({ where: { email_category: { email: email.toLowerCase(), category } } });
    return !!row;
  }

  private sign(email: string, category: string): string {
    return createHmac('sha256', this.env.JWT_ACCESS_SECRET).update(`unsubscribe:${email.toLowerCase()}:${category}`).digest('base64url');
  }

  unsubscribeUrl(email: string, category: EmailCategory): string {
    const e = Buffer.from(email.toLowerCase()).toString('base64url');
    return `${this.env.PUBLIC_API_URL.replace(/\/$/, '')}/v1/emails/unsubscribe?e=${e}&c=${category}&s=${this.sign(email, category)}`;
  }

  /** Vérifie un lien de désinscription ; renvoie l'adresse et la catégorie, ou null. */
  verifyUnsubscribe(e: string, c: string, s: string): { email: string; category: EmailCategory; label: string } | null {
    if (!UNSUBSCRIBABLE.includes(c as EmailCategory)) return null;
    let email: string;
    try {
      email = Buffer.from(e, 'base64url').toString('utf8');
    } catch {
      return null;
    }
    if (!EMAIL_RE.test(email) || !safeEqual(this.sign(email, c), s)) return null;
    return { email, category: c as EmailCategory, label: CATEGORY_LABELS[c as EmailCategory] };
  }

  async suppress(email: string, category: EmailCategory, source = 'link'): Promise<void> {
    await this.prisma.emailSuppression.upsert({
      where: { email_category: { email: email.toLowerCase(), category } },
      create: { email: email.toLowerCase(), category, source, createdAt: this.clock.now() },
      update: {},
    });
    await this.prisma.emailMessage.updateMany({ where: { toEmail: email.toLowerCase(), category, status: 'pending' }, data: { status: 'suppressed' } });
  }

  async resubscribe(email: string, category: EmailCategory): Promise<void> {
    await this.prisma.emailSuppression.deleteMany({ where: { email: email.toLowerCase(), category } });
  }
}
