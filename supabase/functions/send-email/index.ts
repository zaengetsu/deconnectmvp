// Supabase Edge Function: send-email
// Transactional emails via Brevo — style unifié, sans emojis, sans boutons d'app
// Deploy: npx supabase functions deploy send-email --no-verify-jwt

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')!
const FROM_EMAIL    = Deno.env.get('FROM_EMAIL') || 'noreply@deconnect.app'
const FROM_NAME     = 'Sortir Écran'
const BREVO_URL     = 'https://api.brevo.com/v3/smtp/email'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Design system unifié ────────────────────────────────────────────────────
// Palette : bleu #1565C0, violet #6C5CE7, gris foncé #1d1d1f, gris léger #f5f5f7
// Typographie : system-ui stack (pas de web fonts externes)
// Pas d'emojis, pas de boutons redirigeant vers l'app

const wrap = (content: string) => `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sortir Écran</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      background: #f0f2f5;
      color: #1d1d1f;
      padding: 40px 16px;
      -webkit-font-smoothing: antialiased;
    }
    .wrap   { max-width: 560px; margin: 0 auto; }
    .header {
      padding: 20px 28px;
      background: #1565C0;
      border-radius: 12px 12px 0 0;
    }
    .header-logo {
      font-size: 18px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.3px;
    }
    .header-tagline {
      font-size: 12px;
      color: rgba(255,255,255,0.65);
      margin-top: 2px;
      font-weight: 500;
    }
    .card {
      background: #ffffff;
      padding: 32px 28px;
      border-radius: 0 0 12px 12px;
      border: 1px solid #e8e8ea;
      border-top: none;
    }
    h1 {
      font-size: 20px;
      font-weight: 700;
      color: #1d1d1f;
      margin-bottom: 16px;
      line-height: 1.3;
    }
    p {
      font-size: 15px;
      color: #3d3d3f;
      line-height: 1.65;
      margin-bottom: 12px;
    }
    p:last-child { margin-bottom: 0; }
    .muted  { color: #6e6e73; font-size: 13px; line-height: 1.6; }
    .divider { border: none; border-top: 1px solid #e8e8ea; margin: 20px 0; }
    .highlight {
      background: #f5f7ff;
      border-left: 3px solid #1565C0;
      padding: 12px 16px;
      border-radius: 0 8px 8px 0;
      font-size: 14px;
      color: #3d3d3f;
      margin: 16px 0;
      font-style: italic;
    }
    .info-block {
      background: #f5f7ff;
      border-radius: 8px;
      padding: 14px 16px;
      margin: 16px 0;
    }
    .info-block p { font-size: 14px; margin-bottom: 6px; }
    .info-block p:last-child { margin-bottom: 0; }
    .label { font-weight: 600; color: #1d1d1f; }
    .alert {
      background: #fff5f5;
      border: 1px solid #fecaca;
      border-radius: 8px;
      padding: 12px 16px;
      color: #b91c1c;
      font-size: 14px;
      margin: 16px 0;
    }
    .footer {
      text-align: center;
      color: #aeaeb2;
      font-size: 12px;
      margin-top: 24px;
      line-height: 1.7;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div class="header-logo">Sortir Écran</div>
      <div class="header-tagline">Transformer le temps d'écran en vraies aventures</div>
    </div>
    <div class="card">${content}</div>
    <div class="footer">
      Sortir Écran &mdash; Pour toute question, répondez à cet email.<br>
      Vous recevez cet email car vous avez un compte Sortir Écran.
    </div>
  </div>
</body>
</html>`

// ─── Templates ───────────────────────────────────────────────────────────────
const templates: Record<string, (d: Record<string, string>) => { subject: string; html: string }> = {

  // Notification importante relayée par email (5.14).
  // Le push reste le canal principal : l'email ne part que pour les
  // événements que la base marque explicitement avec le canal 'email'.
  notification: (d) => ({
    subject: d.title || 'Deconnect',
    html: wrap(`
      <h1>${d.title || 'Deconnect'}</h1>
      <p>${d.body || ''}</p>
      <hr class="divider">
      <p class="muted">Ouvrez l'application pour voir le détail.</p>
      <p class="muted">Vous pouvez régler ce que vous recevez dans Réglages → Notifications.</p>
    `),
  }),

  // Récapitulatif hebdomadaire
  weekly_report: (d) => ({
    subject: 'Votre semaine avec Deconnect',
    html: wrap(`
      <h1>Votre semaine</h1>
      <p>Bonjour${d.name ? ` ${d.name}` : ''},</p>
      <div class="info-block">
        <p><strong>${d.activities || '0'}</strong> activité(s) terminée(s)</p>
        ${d.hours ? `<p><strong>${d.hours}</strong> passées hors écran</p>` : ''}
        ${d.pending ? `<p><strong>${d.pending}</strong> récompense(s) à valider</p>` : ''}
      </div>
      <p>Ouvrez l'application pour voir le bilan détaillé.</p>
    `),
  }),

  // Nouvelle connexion au compte (sécurité)
  new_login: (d) => ({
    subject: 'Nouvelle connexion à votre compte',
    html: wrap(`
      <h1>Nouvelle connexion</h1>
      <p>Bonjour${d.name ? ` ${d.name}` : ''},</p>
      <p>Une connexion à votre compte vient d'avoir lieu${d.device ? ` depuis ${d.device}` : ''}${d.when ? `, le ${d.when}` : ''}.</p>
      <hr class="divider">
      <p class="muted">Si c'était vous, il n'y a rien à faire. Sinon, changez votre mot de passe dès que possible.</p>
    `),
  }),

  // Profil enfant créé
  child_profile_created: (d) => ({
    subject: `Le profil de ${d.childName || 'votre enfant'} est prêt`,
    html: wrap(`
      <h1>Profil créé</h1>
      <p>Le profil de <strong>${d.childName || 'votre enfant'}</strong> est prêt.</p>
      <div class="info-block">
        <p>— Assignez-lui une première activité</p>
        <p>— Définissez une récompense qui lui parle</p>
        <p>— Reliez son appareil avec le QR code depuis sa fiche</p>
      </div>
    `),
  }),

  // Bienvenue
  welcome: (d) => ({
    subject: 'Bienvenue sur Sortir Écran',
    html: wrap(`
      <h1>Bienvenue, ${d.name || 'cher(e) parent'}</h1>
      <p>Votre espace parent est prêt. Vous pouvez dès maintenant :</p>
      <div class="info-block">
        <p>— Créer le profil de votre enfant</p>
        <p>— Choisir des activités dans le catalogue</p>
        <p>— Définir des récompenses pour le motiver</p>
        <p>— Inviter un co-parent ou un éducateur</p>
      </div>
      <p>Ouvrez l'application pour commencer.</p>
      <hr class="divider">
      <p class="muted">Si vous avez des questions, répondez simplement à cet email.</p>
    `),
  }),

  // Mot de passe oublié — le lien est valide uniquement dans l'app
  password_reset: (d) => ({
    subject: 'Réinitialisation de votre mot de passe',
    html: wrap(`
      <h1>Réinitialiser votre mot de passe</h1>
      <p>Bonjour${d.name ? ` ${d.name}` : ''},</p>
      <p>Nous avons reçu une demande de réinitialisation de mot de passe pour votre compte.</p>
      <p>Ouvrez l'application Sortir Écran, puis entrez le code suivant dans l'écran de réinitialisation :</p>
      <div class="info-block" style="text-align:center">
        <p class="label" style="font-size:28px;letter-spacing:6px;color:#1565C0">${d.resetCode || d.resetUrl || '—'}</p>
        <p class="muted" style="margin-top:8px">Ce code est valable <strong>1 heure</strong>.</p>
      </div>
      <hr class="divider">
      <p class="muted">Si vous n'avez pas fait cette demande, ignorez cet email. Votre mot de passe ne sera pas modifié.</p>
    `),
  }),

  // Confirmation de changement de mot de passe
  password_changed: (d) => ({
    subject: 'Votre mot de passe a été modifié',
    html: wrap(`
      <h1>Mot de passe modifié</h1>
      <p>Bonjour${d.name ? ` ${d.name}` : ''},</p>
      <p>Votre mot de passe Sortir Écran a été modifié le ${new Date().toLocaleDateString('fr-FR')}.</p>
      <div class="alert">
        Si vous n'êtes pas à l'origine de cette modification, contactez-nous immédiatement en répondant à cet email.
      </div>
    `),
  }),

  // Activité soumise — parent doit valider dans l'app
  activity_submitted: (d) => ({
    subject: `${d.childName} a terminé une activité`,
    html: wrap(`
      <h1>Activité en attente de validation</h1>
      <p>Bonjour ${d.parentName},</p>
      <p><span class="label">${d.childName}</span> a terminé l'activité suivante et attend votre validation :</p>
      <div class="info-block">
        <p><span class="label">Activité :</span> ${d.activityTitle}</p>
        ${d.childNote ? `<p><span class="label">Note de ${d.childName} :</span> ${d.childNote}</p>` : ''}
      </div>
      <p>Ouvrez l'application Sortir Écran pour valider ou rejeter cette activité.</p>
    `),
  }),

  // Activité validée — notification à l'enfant (via le parent)
  activity_validated: (d) => ({
    subject: `Activité validée — ${d.activityTitle}`,
    html: wrap(`
      <h1>Activité validée</h1>
      <p>Bonjour ${d.parentName},</p>
      <p>Vous avez validé l'activité <span class="label">"${d.activityTitle}"</span> de <span class="label">${d.childName}</span>.</p>
      <div class="info-block">
        <p><span class="label">Points gagnés :</span> ${d.points || '—'} pts</p>
        ${d.parentNote ? `<p><span class="label">Votre note :</span> ${d.parentNote}</p>` : ''}
      </div>
    `),
  }),

  // Demande de récompense — parent doit répondre dans l'app
  reward_requested: (d) => ({
    subject: `${d.childName} demande une récompense`,
    html: wrap(`
      <h1>Demande de récompense</h1>
      <p>Bonjour ${d.parentName},</p>
      <p><span class="label">${d.childName}</span> souhaite obtenir la récompense suivante :</p>
      <div class="info-block">
        <p><span class="label">Récompense :</span> ${d.rewardTitle}</p>
        ${d.requiredPoints ? `<p><span class="label">Points requis :</span> ${d.requiredPoints} pts</p>` : ''}
      </div>
      <p>Ouvrez l'application Sortir Écran pour approuver ou refuser cette demande.</p>
    `),
  }),

  // Invitation famille (secours si la Edge Function dédiée échoue)
  family_invitation: (d) => ({
    subject: `${d.inviterName} vous invite sur Sortir Écran`,
    html: wrap(`
      <h1>Invitation à rejoindre une famille</h1>
      <p>Bonjour,</p>
      <p><span class="label">${d.inviterName}</span> vous invite à rejoindre sa famille sur Sortir Écran en tant que <span class="label">${d.roleLabel || 'membre'}</span>.</p>
      <p>Pour accepter, ouvrez l'application et entrez le code d'invitation suivant :</p>
      <div class="info-block" style="text-align:center">
        <p class="label" style="font-size:20px;letter-spacing:4px;color:#1565C0">${d.token || '—'}</p>
        <p class="muted" style="margin-top:8px">Ce code est valable <strong>7 jours</strong>.</p>
      </div>
      <hr class="divider">
      <p class="muted">Si vous n'attendiez pas cette invitation, ignorez cet email.</p>
    `),
  }),
}

// ─── Envoi Brevo ─────────────────────────────────────────────────────────────
async function sendBrevo(to: string, toName: string, subject: string, html: string) {
  const res = await fetch(BREVO_URL, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': BREVO_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email: to, name: toName || to }],
      subject,
      htmlContent: html,
    }),
  })
  if (!res.ok) throw new Error(`Brevo error ${res.status}: ${await res.text()}`)
  return res.json()
}

// ─── Handler ─────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { event_type, recipient_email, recipient_name, data } = await req.json()

    if (!BREVO_API_KEY) throw new Error('BREVO_API_KEY not set')

    const tpl = templates[event_type]
    if (!tpl) throw new Error(`Unknown event_type: ${event_type}`)

    const { subject, html } = tpl(data || {})
    await sendBrevo(recipient_email, recipient_name || '', subject, html)

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (err) {
    console.error('[send-email]', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
