// Edge Function: send-family-invitation
// Invitation co-parent/éducateur — style aligné sur send-email
// Deploy: npx supabase functions deploy send-family-invitation --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const BREVO_API_KEY     = Deno.env.get('BREVO_API_KEY')!
const FROM_EMAIL        = Deno.env.get('FROM_EMAIL') || 'noreply@deconnect.app'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ROLE_LABELS: Record<string, string> = {
  co_parent:   'co-parent',
  educator:    'éducateur(rice)',
  grandparent: 'grand-parent',
  babysitter:  'baby-sitter',
}

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
    .info-block { background: #f5f7ff; border-radius: 8px; padding: 14px 16px; margin: 16px 0; }
    .info-block p { font-size: 14px; margin-bottom: 6px; }
    .info-block p:last-child { margin-bottom: 0; }
    .label { font-weight: 600; color: #1d1d1f; }
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
      Vous recevez cet email car un parent vous a invité(e).
    </div>
  </div>
</body>
</html>`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { invite_email, member_role, inviter_name } = await req.json()

    if (!invite_email || !member_role) throw new Error('invite_email et member_role sont requis')

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Non authentifié')

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) throw new Error('Unauthorized')

    // Crée le token via RPC (utilise auth.uid() en interne)
    const { data, error: rpcErr } = await userClient.rpc('create_family_invitation', {
      p_member_role:  member_role,
      p_invite_email: invite_email,
    })
    if (rpcErr) throw rpcErr

    const result      = typeof data === 'string' ? JSON.parse(data) : data
    const token       = result.token
    const senderName  = inviter_name || result.owner_name || 'Un parent'
    const roleLabel   = ROLE_LABELS[member_role] || member_role

    // Envoi email via Brevo
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Sortir Écran', email: FROM_EMAIL },
        to: [{ email: invite_email }],
        subject: `${senderName} vous invite à rejoindre sa famille sur Sortir Écran`,
        htmlContent: emailWrap(`
          <h1>Invitation à rejoindre une famille</h1>
          <p>Bonjour,</p>
          <p>
            <span class="label">${senderName}</span> vous invite à rejoindre sa famille sur
            <strong>Sortir Écran</strong> en tant que <span class="label">${roleLabel}</span>.
          </p>
          <div class="info-block">
            <p>
              Sortir Écran est une application qui aide les familles à encourager leurs enfants
              à réaliser des activités réelles — avec des missions quotidiennes, des points et des récompenses.
            </p>
          </div>
          <p>
            Pour accepter cette invitation, ouvrez l'application <strong>Sortir Écran</strong>
            et entrez le code d'invitation suivant :
          </p>
          <div class="info-block" style="text-align:center">
            <p class="label" style="font-size:22px;letter-spacing:4px;color:#1565C0">${token}</p>
            <p class="muted" style="margin-top:8px">Ce code est valable 7 jours.</p>
          </div>
          <hr class="divider">
          <p class="muted">Si vous n'attendiez pas cette invitation, ignorez cet email.</p>
        `),
      }),
    })

    if (!res.ok) throw new Error(`Brevo error (${res.status}): ${await res.text()}`)

    return new Response(JSON.stringify({ success: true, token }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (err) {
    console.error('[send-family-invitation]', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
