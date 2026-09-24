import { Controller, Get, HttpCode, Module, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../platform/auth/principal';
import { BRAND, esc } from '../../platform/mail/layout';
import { EmailService } from '../../platform/mail/email.service';
import { EmailConsumers } from './emails.consumers';
import { EmailJobs } from './emails.jobs';

function page(title: string, body: string, form?: string): string {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;background:${BRAND.cream};font-family:Manrope,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:${BRAND.ink}">
<main style="max-width:460px;margin:12vh auto 0;padding:0 20px">
<div style="background:#fff;border:1px solid ${BRAND.line};border-radius:22px;padding:30px 26px">
<div style="font-size:18px;font-weight:800;letter-spacing:-.03em;margin-bottom:18px">Rekonect</div>
<h1 style="font-size:22px;line-height:1.3;letter-spacing:-.02em;margin:0 0 12px">${esc(title)}</h1>
<p style="font-size:15px;line-height:1.6;color:${BRAND.text};margin:0">${body}</p>${form ?? ''}
</div></main></body></html>`;
}

/** Désinscription par catégorie (lien signé dans l'email, et « un clic » RFC 8058 via List-Unsubscribe-Post). */
@Controller('v1/emails')
export class EmailsController {
  constructor(private readonly emails: EmailService) {}

  @Public()
  @Get('unsubscribe')
  confirm(@Query('e') e: string, @Query('c') c: string, @Query('s') s: string, @Res() res: Response) {
    const target = this.emails.verifyUnsubscribe(e ?? '', c ?? '', s ?? '');
    res.type('html');
    if (!target) return res.status(400).send(page('Lien invalide', 'Ce lien de désinscription est invalide ou incomplet.'));
    // Confirmation explicite : les antivirus qui ouvrent les liens ne désinscrivent personne.
    const action = `?e=${encodeURIComponent(e)}&c=${encodeURIComponent(c)}&s=${encodeURIComponent(s)}`;
    return res.send(
      page(
        'Ne plus recevoir ces emails ?',
        `Vous ne recevrez plus les emails « ${esc(target.label)} » à l’adresse ${esc(target.email)}. Les emails de sécurité et de facturation continueront d’arriver.`,
        `<form method="post" action="unsubscribe${action}" style="margin-top:22px"><button type="submit" style="border:0;border-radius:999px;background:${BRAND.ink};color:#fff;font:inherit;font-size:14px;font-weight:800;padding:13px 24px;cursor:pointer">Confirmer la désinscription</button></form>`,
      ),
    );
  }

  @Public()
  @Post('unsubscribe')
  @HttpCode(200)
  async unsubscribe(@Query('e') e: string, @Query('c') c: string, @Query('s') s: string, @Res() res: Response) {
    const target = this.emails.verifyUnsubscribe(e ?? '', c ?? '', s ?? '');
    res.type('html');
    if (!target) return res.status(400).send(page('Lien invalide', 'Ce lien de désinscription est invalide ou incomplet.'));
    await this.emails.suppress(target.email, target.category);
    return res.send(page('C’est noté', `Vous ne recevrez plus les emails « ${esc(target.label)} ». Vous pouvez les réactiver à tout moment depuis les préférences de notifications.`));
  }
}

/** Automatisations email (consommateurs d'événements + tâches planifiées) : API et worker. */
@Module({ providers: [EmailConsumers, EmailJobs], exports: [EmailJobs] })
export class EmailsCoreModule {}

@Module({ imports: [EmailsCoreModule], controllers: [EmailsController] })
export class EmailsModule {}
