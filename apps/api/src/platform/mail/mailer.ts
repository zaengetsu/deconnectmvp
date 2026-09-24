import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../../config/env';

export interface MailMessage {
  to: string;
  toName?: string | null;
  subject: string;
  html: string;
  text: string;
  tags?: string[];
}

export type MailResult = { status: 'sent'; id?: string } | { status: 'skipped'; reason: string } | { status: 'failed'; error: string; retryable: boolean };

export abstract class Mailer {
  abstract send(message: MailMessage): Promise<MailResult>;
}

/** Envoi transactionnel via Brevo (même fournisseur que l'Edge Function send-email). */
@Injectable()
export class BrevoMailer extends Mailer {
  private readonly logger = new Logger('Mailer');
  /** Remplaçable dans les tests. */
  fetchFn: typeof fetch = (...args) => fetch(...args);

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }

  async send(message: MailMessage): Promise<MailResult> {
    if (!this.env.BREVO_API_KEY) {
      this.logger.debug(`BREVO_API_KEY absente — email « ${message.subject} » non envoyé`);
      return { status: 'skipped', reason: 'email_not_configured' };
    }
    try {
      const res = await this.fetchFn('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': this.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: { email: this.env.EMAIL_FROM, name: this.env.EMAIL_FROM_NAME },
          to: [{ email: message.to, name: message.toName ?? undefined }],
          subject: message.subject,
          htmlContent: message.html,
          textContent: message.text,
          tags: message.tags,
        }),
      });
      if (res.ok) {
        const body = (await res.json().catch(() => ({}))) as { messageId?: string };
        return { status: 'sent', id: body.messageId };
      }
      const error = `${res.status} ${await res.text().catch(() => '')}`.trim();
      return { status: 'failed', error, retryable: res.status >= 500 || res.status === 429 };
    } catch (err) {
      return { status: 'failed', error: (err as Error).message, retryable: true };
    }
  }
}

/** Mailer de test : garde les messages en mémoire. */
export class MemoryMailer extends Mailer {
  readonly sent: MailMessage[] = [];
  async send(message: MailMessage): Promise<MailResult> {
    this.sent.push(message);
    return { status: 'sent', id: String(this.sent.length) };
  }
}
