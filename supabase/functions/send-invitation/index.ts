// Edge Function: send-invitation
// Invitation d'un enfant (par email ou SMS) — style aligné sur send-email
// Deploy: npx supabase functions deploy send-invitation --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BREVO_API_KEY     = Deno.env.get('BREVO_API_KEY')!
const FROM_EMAIL        = Deno.env.get('FROM_EMAIL') || 'noreply@deconnect.app'
const APP_URL           = Deno.env.get('APP_URL') || 'https://deconnect.app'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  try {
    const { child_id, method, recipient, child_name, parent_name } = await req.json()

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Non authentifié')

    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) throw new Error('Unauthorized')

    const { data: token, error: rpcErr } = await supabase.rpc('create_child_invitation', {
      p_child_id: child_id,
      p_method:   method,
      p_recipient: recipient,
    })
    if (rpcErr) throw rpcErr

    const inviteUrl = `${APP_URL}/invite/${token}`

    if (method === 'email') {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'Sortir Écran', email: FROM_EMAIL },
          to: [{ email: recipient }],
          subject: `${parent_name} vous a créé un espace sur Sortir Écran`,
          htmlContent: emailWrap(`
            <h1>Vous avez été invité(e)</h1>
            <p>Bonjour,</p>
            <p>
              <span class="label">${parent_name}</span> vous a créé un espace personnel sur
              <strong>Sortir Écran</strong> pour <span class="label">${child_name}</span>.
            </p>
            <div class="info-block">
              <p>
                Sortir Écran est une application qui transforme les activités du quotidien en défis ludiques.
                Chaque activité réalisée rapporte des points, des badges et des récompenses choisies par vos parents.
              </p>
            </div>
            <p>
              Téléchargez l'application <strong>Sortir Écran</strong>, créez votre compte et utilisez
              le lien d'invitation suivant pour rejoindre votre espace :
            </p>
            <div class="info-block" style="word-break:break-all">
              <p class="label" style="font-size:13px;color:#1565C0">${inviteUrl}</p>
              <p class="muted" style="margin-top:6px">Ce lien est valable 7 jours.</p>
            </div>
            <hr class="divider">
            <p class="muted">Si vous n'attendiez pas cette invitation, ignorez cet email.</p>
          `),
        }),
      })
      if (!res.ok) throw new Error(`Brevo error: ${await res.text()}`)

    } else if (method === 'phone') {
      // SMS via Twilio (optionnel)
      const TWILIO_SID   = Deno.env.get('TWILIO_ACCOUNT_SID')
      const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
      const TWILIO_FROM  = Deno.env.get('TWILIO_FROM')

      if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
        console.warn('[send-invitation] Twilio non configuré — SMS ignoré')
      } else {
        const message = `${parent_name} vous a créé un espace Sortir Écran pour ${child_name}. Rejoignez-le : ${inviteUrl}`
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ To: recipient, From: TWILIO_FROM, Body: message }),
        })
        if (!res.ok) throw new Error(`Twilio error: ${await res.text()}`)
      }
    }

    return new Response(JSON.stringify({ success: true, token }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (err) {
    console.error('[send-invitation]', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
