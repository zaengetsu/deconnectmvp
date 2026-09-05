// Edge Function: send-push-notification
// Sends a push notification to a user's registered device(s) via APNS (iOS) or FCM v1 (Android).
//
// Required Supabase secrets:
//   APNS_KEY_ID              — Apple APNs key ID (from developer.apple.com)
//   APNS_TEAM_ID             — Apple Team ID
//   APNS_PRIVATE_KEY         — APNs .p8 key content (base64 or raw PEM)
//   APNS_BUNDLE_ID           — App bundle ID (e.g. ceo.services.rekonect)
//   FCM_SERVICE_ACCOUNT_JSON — Firebase Service Account JSON (from Firebase Console → Service Accounts)
//
// Deploy: npx supabase functions deploy send-push-notification --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL            = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APNS_KEY_ID             = Deno.env.get('APNS_KEY_ID') || ''
const APNS_TEAM_ID            = Deno.env.get('APNS_TEAM_ID') || ''
const APNS_PRIVATE_KEY        = Deno.env.get('APNS_PRIVATE_KEY') || ''
const APNS_BUNDLE_ID          = Deno.env.get('APNS_BUNDLE_ID') || 'ceo.services.rekonect'
const FCM_SERVICE_ACCOUNT_JSON = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON') || ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── APNs JWT generation ──────────────────────────────────────────────────────
async function generateApnsJwt(): Promise<string> {
  let keyPem = APNS_PRIVATE_KEY
  if (!keyPem.includes('-----BEGIN')) {
    keyPem = atob(keyPem)
  }

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
type PushResult = { ok: boolean; invalidToken: boolean }

async function sendApns(token: string, title: string, body: string, data: Record<string, unknown> = {}): Promise<PushResult> {
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_PRIVATE_KEY) {
    console.warn('[APNS] Missing credentials — skipping iOS push')
    return { ok: false, invalidToken: false }
  }

  const jwt = await generateApnsJwt()
  const apnsHost = 'https://api.push.apple.com'

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
    // 410 Gone / BadDeviceToken : l'appareil a désinstallé ou changé de token
    const invalidToken =
      res.status === 410 ||
      errBody.includes('BadDeviceToken') ||
      errBody.includes('Unregistered')
    return { ok: false, invalidToken }
  }
  return { ok: true, invalidToken: false }
}

// ── FCM v1: Get OAuth2 access token from Service Account ─────────────────────
async function getFcmAccessToken(serviceAccount: Record<string, string>): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const claim = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  // Build JWT header + payload
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const payload = btoa(JSON.stringify(claim))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  // Import the RSA private key
  const pemContents = serviceAccount.private_key
    .replace('-----BEGIN RSA PRIVATE KEY-----', '')
    .replace('-----END RSA PRIVATE KEY-----', '')
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')
  const keyBytes = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  // Sign the JWT
  const toSign = new TextEncoder().encode(`${header}.${payload}`)
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, toSign)
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const jwt = `${header}.${payload}.${sigB64}`

  // Exchange JWT for access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  })

  const tokenJson = await tokenRes.json()
  if (!tokenJson.access_token) throw new Error(`FCM token error: ${JSON.stringify(tokenJson)}`)
  return tokenJson.access_token
}

// ── Send to a single Android device (FCM v1 API) ──────────────────────────────
async function sendFcm(token: string, title: string, body: string, data: Record<string, unknown> = {}): Promise<PushResult> {
  if (!FCM_SERVICE_ACCOUNT_JSON) {
    console.warn('[FCM] Missing service account — skipping Android push')
    return { ok: false, invalidToken: false }
  }

  let serviceAccount: Record<string, string>
  try {
    serviceAccount = JSON.parse(FCM_SERVICE_ACCOUNT_JSON)
  } catch {
    console.error('[FCM] Invalid service account JSON')
    return { ok: false, invalidToken: false }
  }

  const projectId = serviceAccount.project_id
  if (!projectId) {
    console.error('[FCM] Missing project_id in service account')
    return { ok: false, invalidToken: false }
  }

  const accessToken = await getFcmAccessToken(serviceAccount)

  // Convert data values to strings (FCM v1 requirement)
  const stringData: Record<string, string> = {}
  for (const [k, v] of Object.entries(data)) {
    stringData[k] = String(v)
  }

  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        android: {
          notification: {
            sound: 'default',
            channel_id: 'default',
          },
        },
        data: stringData,
      },
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    console.error('[FCM] Error:', res.status, errBody)
    // UNREGISTERED / token invalide : à purger de push_tokens
    const invalidToken =
      res.status === 404 ||
      errBody.includes('UNREGISTERED') ||
      errBody.includes('INVALID_ARGUMENT')
    return { ok: false, invalidToken }
  }
  return { ok: true, invalidToken: false }
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const payload = await req.json()

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE)

    // Deux modes d'appel :
    //  • { notification_id }                        → déclenché par la base (trigger / cron)
    //  • { recipient_type, recipient_id, title, … }  → appel direct
    //  • { user_id, title, body, data }              → ancien format, conservé
    let recipientType: 'parent' | 'child' | null = payload.recipient_type ?? null
    let recipientId: string | null = payload.recipient_id ?? payload.user_id ?? null
    let title: string = payload.title
    let body: string = payload.body
    let data: Record<string, unknown> = payload.data ?? {}
    let notificationId: string | null = payload.notification_id ?? null

    if (notificationId) {
      const { data: notif, error } = await admin
        .from('notifications')
        .select('id, recipient_type, recipient_id, title, body, route, data, channels, status')
        .eq('id', notificationId)
        .single()

      if (error || !notif) throw new Error('Notification introuvable')
      if (!notif.channels?.includes('push')) {
        return new Response(JSON.stringify({ success: true, skipped: 'push non demandé' }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      recipientType = notif.recipient_type
      recipientId   = notif.recipient_id
      title         = notif.title
      body          = notif.body
      // Le deep link voyage dans le payload : c'est lui qui ouvre le bon écran.
      data = { ...(notif.data ?? {}), route: notif.route ?? '', notification_id: notif.id }
    }

    if (!recipientId || !title || !body) {
      throw new Error('recipient_id (ou user_id), title et body sont requis')
    }

    // Un token appartient soit à un parent (user_id), soit à un enfant (child_id)
    const query = admin.from('push_tokens').select('id, token, platform')
    const { data: tokens, error: tokErr } = recipientType === 'child'
      ? await query.eq('child_id', recipientId)
      : await query.eq('user_id', recipientId)

    if (tokErr) throw tokErr
    if (!tokens || tokens.length === 0) {
      console.info('[PushNotification] Aucun token pour', recipientType, recipientId)
      return new Response(JSON.stringify({ success: true, sent: 0, total: 0 }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    let sent = 0
    const staleTokenIds: string[] = []

    for (const { id, token, platform } of tokens) {
      let result: PushResult = { ok: false, invalidToken: false }
      if (platform === 'ios') result = await sendApns(token, title, body, data)
      else if (platform === 'android') result = await sendFcm(token, title, body, data)

      if (result.ok) sent++
      if (result.invalidToken) staleTokenIds.push(id)
    }

    // Purge des tokens morts : sans ça la table se remplit d'appareils fantômes
    if (staleTokenIds.length > 0) {
      await admin.from('push_tokens').delete().in('id', staleTokenIds)
      console.info(`[PushNotification] ${staleTokenIds.length} token(s) invalide(s) supprimé(s)`)
    }

    if (notificationId && sent === 0 && tokens.length > 0) {
      await admin.from('notifications').update({ status: 'failed' }).eq('id', notificationId)
    }

    console.info(`[PushNotification] ${sent}/${tokens.length} envoyé(s) → ${recipientType} ${recipientId}`)
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
