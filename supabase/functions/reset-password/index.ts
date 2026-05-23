// Edge Function: reset-password
// Flow custom sans lien web — l'utilisateur saisit le token dans l'app
// Step 1: POST { action: "request", email } → génère token + envoie email avec code
// Step 2: POST { action: "confirm", token, new_password } → valide token + change MDP

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BREVO_API_KEY     = Deno.env.get('BREVO_API_KEY')!
const FROM_EMAIL        = Deno.env.get('FROM_EMAIL') || 'noreply@deconnect.app'

// ─── Design system partagé ───────────────────────────────────────────────────
const emailWrap = (content: string) => `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sortir Écran</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
           background: #f0f2f5; color: #1d1d1f; padding: 40px 16px; -webkit-font-smoothing: antialiased; }
    .wrap   { max-width: 560px; margin: 0 auto; }
    .header { padding: 20px 28px; background: #1565C0; border-radius: 12px 12px 0 0; }
    .header-logo    { font-size: 18px; font-weight: 800; color: #ffffff; letter-spacing: -0.3px; }
    .header-tagline { font-size: 12px; color: rgba(255,255,255,0.65); margin-top: 2px; font-weight: 500; }
    .card { background: #ffffff; padding: 32px 28px; border-radius: 0 0 12px 12px;
            border: 1px solid #e8e8ea; border-top: none; }
    h1  { font-size: 20px; font-weight: 700; color: #1d1d1f; margin-bottom: 16px; line-height: 1.3; }
    p   { font-size: 15px; color: #3d3d3f; line-height: 1.65; margin-bottom: 12px; }
    p:last-child { margin-bottom: 0; }
    .muted   { color: #6e6e73; font-size: 13px; line-height: 1.6; }
    .divider { border: none; border-top: 1px solid #e8e8ea; margin: 20px 0; }
    .code-block {
      background: #f5f7ff; border: 1px solid #dde3ff; border-radius: 10px;
      padding: 20px; text-align: center; margin: 20px 0;
    }
    .code { font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #1565C0;
            font-variant-numeric: tabular-nums; }
    .code-label { font-size: 12px; color: #6e6e73; margin-top: 8px; }
    .alert { background: #fff5f5; border: 1px solid #fecaca; border-radius: 8px;
             padding: 12px 16px; color: #b91c1c; font-size: 14px; margin: 16px 0; }
    .footer { text-align: center; color: #aeaeb2; font-size: 12px; margin-top: 24px; line-height: 1.7; }
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
      Vous recevez cet email car vous avez demandé une réinitialisation de mot de passe.
    </div>
  </div>
</body>
</html>`

async function sendBrevo(to: string, name: string, subject: string, html: string) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Sortir Écran', email: FROM_EMAIL },
      to: [{ email: to, name: name || to }],
      subject,
      htmlContent: html,
    }),
  })
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${await res.text()}`)
}

// ─── Handler ─────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  try {
    const body = await req.json()

    // ── Étape 1 : demande de réinitialisation ─────────────────────────────
    if (body.action === 'request') {
      const { email } = body

      if (!email) throw new Error('email requis')

      // Génère le token via RPC custom (table password_reset_tokens)
      const { data: token, error: rpcErr } = await supabase.rpc('create_password_reset_token', {
        p_email: email,
      })
      if (rpcErr) throw rpcErr

      // Récupère le nom du profil
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('email', email)
        .maybeSingle()

      const name = profile?.full_name || ''

      // On envoie le token comme code à saisir dans l'app — pas de lien web
      await sendBrevo(email, name, 'Réinitialisation de votre mot de passe', emailWrap(`
        <h1>Réinitialiser votre mot de passe</h1>
        <p>Bonjour${name ? ` ${name}` : ''},</p>
        <p>
          Nous avons reçu une demande de réinitialisation de mot de passe pour votre compte.<br>
          Ouvrez l'application <strong>Sortir Écran</strong> et entrez le code ci-dessous sur l'écran de réinitialisation.
        </p>
        <div class="code-block">
          <div class="code">${token}</div>
          <div class="code-label">Ce code est valable 1 heure.</div>
        </div>
        <hr class="divider">
        <p class="muted">Si vous n'avez pas demandé cette réinitialisation, ignorez cet email. Votre mot de passe ne sera pas modifié.</p>
      `))

      // On ne révèle jamais si l'email existe ou non (sécurité)
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    // ── Étape 2 : confirmation avec le token ──────────────────────────────
    if (body.action === 'confirm') {
      const { token, new_password } = body

      if (!token || !new_password) throw new Error('token et new_password requis')
      if (new_password.length < 6) throw new Error('Le mot de passe doit contenir au moins 6 caractères')

      const { data, error } = await supabase.rpc('use_password_reset_token', {
        p_token:        token,
        p_new_password: new_password,
      })

      if (error || !data?.success) {
        return new Response(JSON.stringify({ success: false, error: 'Code invalide ou expiré' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      // Email de confirmation de changement
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', data.user_id)
        .maybeSingle()

      if (profile?.email) {
        const name = profile.full_name || ''
        await sendBrevo(
          profile.email, name,
          'Votre mot de passe a été modifié',
          emailWrap(`
            <h1>Mot de passe modifié</h1>
            <p>Bonjour${name ? ` ${name}` : ''},</p>
            <p>
              Votre mot de passe Sortir Écran a été modifié le
              <strong>${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</strong>.
            </p>
            <div class="alert">
              Si vous n'êtes pas à l'origine de cette modification, contactez-nous immédiatement en répondant à cet email.
            </div>
          `)
        )
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    throw new Error('action invalide — valeurs acceptées : "request" | "confirm"')
  } catch (err) {
    console.error('[reset-password]', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
