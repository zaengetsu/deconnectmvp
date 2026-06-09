// Edge Function: send-push-notification
// Sends a push notification to a user's registered device(s) via APNS (iOS) or FCM (Android).
//
// Required Supabase secrets:
//   APNS_KEY_ID         — Apple APNs key ID (from developer.apple.com)
//   APNS_TEAM_ID        — Apple Team ID
//   APNS_PRIVATE_KEY    — APNs .p8 key content (base64 or raw PEM)
//   APNS_BUNDLE_ID      — App bundle ID (e.g. com.deconnect.app)
//   FCM_SERVER_KEY      — Firebase Cloud Messaging server key (for Android)
//
// Deploy: npx supabase functions deploy send-push-notification --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL            = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APNS_KEY_ID             = Deno.env.get('APNS_KEY_ID') || ''
const APNS_TEAM_ID            = Deno.env.get('APNS_TEAM_ID') || ''
const APNS_PRIVATE_KEY        = Deno.env.get('APNS_PRIVATE_KEY') || ''
const APNS_BUNDLE_ID          = Deno.env.get('APNS_BUNDLE_ID') || 'com.deconnect.app'
const FCM_SERVER_KEY          = Deno.env.get('FCM_SERVER_KEY') || ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── APNs JWT generation ──────────────────────────────────────────────────────
// APNs requires a JWT signed with the .p8 key every hour.
// We generate it on each request (simple for low-volume MVP).
async function generateApnsJwt(): Promise<string> {
  // Decode base64 key if needed
  let keyPem = APNS_PRIVATE_KEY
  if (!keyPem.includes('-----BEGIN')) {
    // Assume base64 encoded
    keyPem = atob(keyPem)
  }

  // Extract raw key bytes from PEM
  const pemContents = keyPem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')
  const keyBytes = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes.buffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )

  const header = btoa(JSON.stringify({ alg: 'ES256', kid: APNS_KEY_ID }))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const payload = btoa(JSON.stringify({ iss: APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) }))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const toSign = new TextEncoder().encode(`${header}.${payload}`)
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, cryptoKey, toSign)
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  return `${header}.${payload}.${sigB64}`
}

// ── Send to a single iOS device ───────────────────────────────────────────────
async function sendApns(token: string, title: string, body: string, data: Record<string, unknown> = {}): Promise<boolean> {
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_PRIVATE_KEY) {
    console.warn('[APNS] Missing credentials — skipping iOS push')
    return false
  }

  const jwt = await generateApnsJwt()
  const isProduction = true // Set to false for sandbox testing
  const apnsHost = isProduction
    ? 'https://api.push.apple.com'
    : 'https://api.sandbox.push.apple.com'

  const res = await fetch(`${apnsHost}/3/device/${token}`, {
    method: 'POST',
    headers: {
      'authorization': `bearer ${jwt}`,
      'apns-topic': APNS_BUNDLE_ID,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      aps: {
        alert: { title, body },
        sound: 'default',
        badge: 1,
      },
      ...data,
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    console.error('[APNS] Error:', res.status, errBody)
    return false
  }
  return true
}

// ── Send to a single Android device (FCM Legacy API) ──────────────────────────
async function sendFcm(token: string, title: string, body: string, data: Record<string, unknown> = {}): Promise<boolean> {
  if (!FCM_SERVER_KEY) {
    console.warn('[FCM] Missing server key — skipping Android push')
    return false
  }

  const res = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      'Authorization': `key=${FCM_SERVER_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: token,
      notification: { title, body, sound: 'default' },
      data,
    }),
  })

  const json = await res.json()
  if (json.failure > 0) {
    console.error('[FCM] Error:', json)
    return false
  }
  return true
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { user_id, title, body, data = {} } = await req.json()
    if (!user_id || !title || !body) throw new Error('user_id, title et body sont requis')

    // Use service role to read push tokens (bypasses RLS)
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
    const { data: tokens, error: tokErr } = await admin
      .from('push_tokens')
      .select('token, platform')
      .eq('user_id', user_id)

    if (tokErr) throw tokErr
    if (!tokens || tokens.length === 0) {
      console.info('[PushNotification] No tokens for user:', user_id)
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    let sent = 0
    for (const { token, platform } of tokens) {
      let ok = false
      if (platform === 'ios') ok = await sendApns(token, title, body, data)
      else if (platform === 'android') ok = await sendFcm(token, title, body, data)
      if (ok) sent++
    }

    console.info(`[PushNotification] Sent ${sent}/${tokens.length} for user ${user_id}`)
    return new Response(JSON.stringify({ success: true, sent, total: tokens.length }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (err) {
    console.error('[send-push-notification]', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
