// Ancien format (avant le catalogue catalog.ts) : conservé le temps de migrer les derniers envois directs.
// Emails transactionnels : sobres, sans emoji ni bouton vers l'app (charte de l'ancien send-email),
// aux couleurs Rekonect. Réservés aux événements importants (5.14).
import type { MailMessage } from './mailer';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function layout(title: string, paragraphs: string[], link?: { label: string; url: string }): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#2B2B3A">${esc(p)}</p>`).join('');
  const cta = link
    ? `<p style="margin:20px 0 0"><a href="${esc(link.url)}" style="color:#3C41A8;font-weight:700">${esc(link.label)}</a></p>`
    : '';
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:32px 16px;background:#F6F4F1;font-family:Manrope,-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto">
<div style="background:#3C41A8;border-radius:20px 20px 0 0;padding:20px 28px;color:#fff;font-weight:800;font-size:18px">Rekonect</div>
<div style="background:#fff;border-radius:0 0 20px 20px;padding:28px">
<h1 style="margin:0 0 16px;font-size:20px;color:#1E1E2A">${esc(title)}</h1>${body}${cta}
</div>
<p style="margin:16px 0 0;font-size:12px;color:#77778A;text-align:center">Vous recevez cet email car vous avez un compte Rekonect.</p>
</div></body></html>`;
}

function message(to: string, subject: string, title: string, paragraphs: string[], link?: { label: string; url: string }, toName?: string | null): MailMessage {
  const text = [title, '', ...paragraphs, ...(link ? ['', `${link.label} : ${link.url}`] : [])].join('\n');
  return { to, toName, subject, html: layout(title, paragraphs, link), text };
}

export const mails = {
  welcome: (to: string, name: string | null) =>
    message(to, 'Bienvenue sur Rekonect', `Bienvenue${name ? ` ${name}` : ''} !`, [
      'Votre compte parent est prêt. Ajoutez le profil de votre enfant, puis reliez son appareil avec le code affiché dans l’application.',
      'Rekonect vous aide à accompagner vos enfants vers des activités hors écran, sans les surveiller en permanence.',
    ], undefined, name),

  passwordReset: (to: string, url: string) =>
    message(to, 'Réinitialisation de votre mot de passe', 'Réinitialiser votre mot de passe', [
      'Vous avez demandé à réinitialiser votre mot de passe. Ce lien est valable une heure.',
      'Si vous n’êtes pas à l’origine de cette demande, ignorez cet email : votre mot de passe reste inchangé.',
    ], { label: 'Choisir un nouveau mot de passe', url }),

  passwordChanged: (to: string) =>
    message(to, 'Votre mot de passe a été modifié', 'Mot de passe modifié', [
      'Le mot de passe de votre compte Rekonect vient d’être modifié et vos autres sessions ont été fermées.',
      'Si vous n’êtes pas à l’origine de ce changement, contactez-nous immédiatement.',
    ]),

  partnerInvitation: (to: string, partnerName: string, url: string) =>
    message(to, `Invitation à rejoindre ${partnerName} sur Rekonect`, `Rejoignez ${partnerName}`, [
      `Vous êtes invité à gérer les offres de ${partnerName} sur le portail partenaires Rekonect.`,
      'Ce lien est valable 7 jours.',
    ], { label: 'Accepter l’invitation', url }),

  offerDecision: (to: string, offerTitle: string, approved: boolean, reason?: string | null) =>
    message(
      to,
      approved ? `Offre publiée : ${offerTitle}` : `Offre à revoir : ${offerTitle}`,
      approved ? 'Votre offre est en ligne' : 'Votre offre n’a pas été publiée',
      approved
        ? [`« ${offerTitle} » a été validée par l’équipe Rekonect et est désormais visible par les familles concernées.`]
        : [`« ${offerTitle} » n’a pas été validée.`, `Motif : ${reason ?? 'non précisé'}`, 'Vous pouvez la modifier et la soumettre à nouveau.'],
    ),

  notification: (to: string, name: string | null, title: string, body: string) =>
    message(to, title, title, body.split('\n').filter(Boolean), undefined, name),
};
