import { createSign, type KeyObject, createPrivateKey } from 'node:crypto';
import * as http2 from 'node:http2';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../../../config/env';

export interface PushMessage {
  title: string;
  body: string;
  badge?: number;
  /** Données du deep link : route, notificationId, type, entité. */
  data: Record<string, string>;
}

export interface PushTarget {
  token: string;
  platform: 'ios' | 'android' | 'web';
  environment: 'development' | 'production';
}

export type PushResult =
  | { ok: true }
  | { ok: false; invalidToken: boolean; retryable: boolean; error: string; skipped?: boolean };

export abstract class PushTransport {
  abstract send(target: PushTarget, message: PushMessage): Promise<PushResult>;
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString('base64url');

function signJwt(header: object, payload: object, key: KeyObject, alg: 'ES256' | 'RS256'): string {
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signer = createSign('SHA256');
  signer.update(unsigned);
  const signature = alg === 'ES256' ? signer.sign({ key, dsaEncoding: 'ieee-p1363' }) : signer.sign(key);
  return `${unsigned}.${b64url(signature)}`;
}

function pemFrom(raw: string): string {
  const value = raw.includes('-----BEGIN') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return value.replace(/\\n/g, '\n');
}

/**
 * APNs (HTTP/2 obligatoire) + FCM v1. Port de l'Edge Function send-push-notification, avec :
 * - bac à sable APNs pour les jetons de développement ;
 * - mise en cache des jetons d'authentification fournisseurs ;
 * - distinction jeton invalide (à purger) / erreur temporaire (à retenter).
 */
@Injectable()
export class ProviderPushTransport extends PushTransport {
  private readonly logger = new Logger('Push');
  private apnsJwt?: { value: string; at: number };
  private fcmToken?: { value: string; expiresAt: number };
  private readonly sessions = new Map<string, http2.ClientHttp2Session>();
  /** Remplaçables dans les tests. */
  fetchFn: typeof fetch = (...args) => fetch(...args);
  http2Request: (host: string, path: string, headers: Record<string, string>, body: string) => Promise<{ status: number; body: string }> = (
    host,
    path,
    headers,
    body,
  ) => this.defaultHttp2Request(host, path, headers, body);

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }

  async send(target: PushTarget, message: PushMessage): Promise<PushResult> {
    if (target.platform === 'ios') return this.sendApns(target, message);
    if (target.platform === 'android') return this.sendFcm(target, message);
    return { ok: false, invalidToken: false, retryable: false, error: 'web_push_not_supported', skipped: true };
  }

  // ─── APNs ──────────────────────────────────────────────────────────────────

  private apnsAuth(): string {
    const now = Math.floor(Date.now() / 1000);
    if (this.apnsJwt && now - this.apnsJwt.at < 45 * 60) return this.apnsJwt.value;
    const key = createPrivateKey(pemFrom(this.env.APNS_PRIVATE_KEY));
    const value = signJwt({ alg: 'ES256', kid: this.env.APNS_KEY_ID }, { iss: this.env.APNS_TEAM_ID, iat: now }, key, 'ES256');
    this.apnsJwt = { value, at: now };
    return value;
  }

  private async sendApns(target: PushTarget, message: PushMessage): Promise<PushResult> {
    if (!this.env.APNS_KEY_ID || !this.env.APNS_TEAM_ID || !this.env.APNS_PRIVATE_KEY) {
      return { ok: false, invalidToken: false, retryable: false, error: 'apns_not_configured', skipped: true };
    }
    const host = target.environment === 'development' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
    const payload = JSON.stringify({
      aps: { alert: { title: message.title, body: message.body }, sound: 'default', ...(message.badge != null ? { badge: message.badge } : {}) },
      ...message.data,
    });
    try {
      const res = await this.http2Request(
        host,
        `/3/device/${target.token}`,
        {
          authorization: `bearer ${this.apnsAuth()}`,
          'apns-topic': this.env.APNS_BUNDLE_ID,
          'apns-push-type': 'alert',
          'apns-priority': '10',
          'content-type': 'application/json',
        },
        payload,
      );
      if (res.status === 200) return { ok: true };
      const invalidToken = res.status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(res.body);
      return { ok: false, invalidToken, retryable: res.status === 429 || res.status >= 500, error: `apns ${res.status} ${res.body}`.trim() };
    } catch (err) {
      return { ok: false, invalidToken: false, retryable: true, error: `apns ${(err as Error).message}` };
    }
  }

  private defaultHttp2Request(host: string, path: string, headers: Record<string, string>, body: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      let session = this.sessions.get(host);
      if (!session || session.closed || session.destroyed) {
        session = http2.connect(host);
        session.on('error', () => this.sessions.delete(host));
        session.on('close', () => this.sessions.delete(host));
        this.sessions.set(host, session);
      }
      const req = session.request({ ':method': 'POST', ':path': path, ...headers });
      let status = 0;
      let data = '';
      req.setEncoding('utf8');
      req.setTimeout(10_000, () => req.close(http2.constants.NGHTTP2_CANCEL));
      req.on('response', (h) => (status = Number(h[':status'])));
      req.on('data', (chunk: string) => (data += chunk));
      req.on('end', () => resolve({ status, body: data }));
      req.on('error', reject);
      req.end(body);
    });
  }

  // ─── FCM v1 ────────────────────────────────────────────────────────────────

  private async fcmAccessToken(account: { client_email: string; private_key: string }): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.fcmToken && this.fcmToken.expiresAt - 60 > now) return this.fcmToken.value;
    const assertion = signJwt(
      { alg: 'RS256', typ: 'JWT' },
      { iss: account.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 },
      createPrivateKey(pemFrom(account.private_key)),
      'RS256',
    );
    const res = await this.fetchFn('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${assertion}`,
    });
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) throw new Error(`FCM oauth: ${JSON.stringify(json)}`);
    this.fcmToken = { value: json.access_token, expiresAt: now + (json.expires_in ?? 3600) };
    return json.access_token;
  }

  private async sendFcm(target: PushTarget, message: PushMessage): Promise<PushResult> {
    if (!this.env.FCM_SERVICE_ACCOUNT_JSON) {
      return { ok: false, invalidToken: false, retryable: false, error: 'fcm_not_configured', skipped: true };
    }
    let account: { project_id: string; client_email: string; private_key: string };
    try {
      account = JSON.parse(this.env.FCM_SERVICE_ACCOUNT_JSON);
    } catch {
      return { ok: false, invalidToken: false, retryable: false, error: 'fcm_invalid_service_account', skipped: true };
    }
    try {
      const accessToken = await this.fcmAccessToken(account);
      const res = await this.fetchFn(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: target.token,
            notification: { title: message.title, body: message.body },
            android: { priority: 'HIGH', notification: { sound: 'default', channel_id: 'default', ...(message.badge != null ? { notification_count: message.badge } : {}) } },
            data: message.data,
          },
        }),
      });
      if (res.ok) return { ok: true };
      const body = await res.text();
      const invalidToken = res.status === 404 || /UNREGISTERED|registration-token-not-registered/.test(body) || (res.status === 400 && /INVALID_ARGUMENT/.test(body) && /token/i.test(body));
      return { ok: false, invalidToken, retryable: res.status === 429 || res.status >= 500, error: `fcm ${res.status} ${body}`.slice(0, 500) };
    } catch (err) {
      return { ok: false, invalidToken: false, retryable: true, error: `fcm ${(err as Error).message}` };
    }
  }

  onModuleDestroy(): void {
    for (const s of this.sessions.values()) s.close();
    this.sessions.clear();
    this.logger.debug('Sessions APNs fermées');
  }
}

/** Transport de test : enregistre les envois et simule les réponses fournisseurs. */
export class FakePushTransport extends PushTransport {
  readonly sent: { target: PushTarget; message: PushMessage }[] = [];
  responses = new Map<string, PushResult>();
  async send(target: PushTarget, message: PushMessage): Promise<PushResult> {
    this.sent.push({ target, message });
    return this.responses.get(target.token) ?? { ok: true };
  }
}
