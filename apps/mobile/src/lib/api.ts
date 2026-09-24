import { sessionStore } from './session';

/**
 * Client de l'API Rekonect (NestJS) — seul point de contact de l'app avec le serveur.
 *
 *  - jeton d'accès court + jeton de rafraîchissement rotatif (lib/session.ts) ;
 *  - 401 → un seul rafraîchissement partagé entre les requêtes en vol, puis nouvel essai ;
 *  - délai maximal par requête (une WebView iOS n'ouvre que 6 connexions par hôte : une
 *    requête bloquée ne doit jamais geler l'app) ;
 *  - coupure réseau courte → un nouvel essai pour les lectures.
 */
export const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000').replace(/\/$/, '');

const TIMEOUT_MS = 15_000;
const UPLOAD_TIMEOUT_MS = 90_000;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type Query = Record<string, string | number | boolean | null | undefined>;

export function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return qs ? `${path}${path.includes('?') ? '&' : '?'}${qs}` : path;
}

interface RequestOptions {
  /** false : requête publique (connexion, inscription…), sans jeton ni rafraîchissement. */
  auth?: boolean;
  /** Corps binaire (preuve photo / vidéo). */
  raw?: { data: Blob | ArrayBuffer; contentType: string };
  timeoutMs?: number;
}

let refreshing: Promise<boolean> | null = null;

/** Rafraîchit la session ; false si elle est expirée (elle est alors effacée). */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const s = await sessionStore.get();
    if (!s) return false;
    try {
      const res = await send('POST', '/v1/auth/refresh', { refreshToken: s.refreshToken }, { auth: false });
      const pair = res as { accessToken: string; refreshToken: string };
      await sessionStore.updateTokens(pair.accessToken, pair.refreshToken);
      return true;
    } catch (e) {
      // Jeton refusé (révoqué, expiré, réutilisé) : la session est terminée. Coupure réseau : on garde la session.
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) await sessionStore.clear();
      return false;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function send(method: string, path: string, body: unknown, opts: RequestOptions, token?: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? (opts.raw ? UPLOAD_TIMEOUT_MS : TIMEOUT_MS));
  const headers: Record<string, string> = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (opts.raw) {
    headers['content-type'] = opts.raw.contentType;
    payload = opts.raw.data;
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers, body: payload, signal: controller.signal });
  } catch (e) {
    const aborted = (e as Error)?.name === 'AbortError';
    throw new ApiError(0, aborted ? 'TIMEOUT' : 'NETWORK_ERROR', aborted ? 'Le serveur met trop de temps à répondre. Réessayez.' : 'Connexion impossible. Vérifiez votre réseau.');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { code?: string; message?: string | string[]; details?: unknown };
    const message = Array.isArray(err.message) ? err.message.join(' ') : err.message;
    throw new ApiError(res.status, err.code ?? `HTTP_${res.status}`, message ?? 'Une erreur est survenue.', err.details);
  }
  if (res.status === 204) return undefined;
  const text = await res.text();
  return text ? JSON.parse(text) : undefined;
}

export async function api<T>(method: string, path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
  const authenticated = opts.auth !== false;
  const token = authenticated ? (await sessionStore.get())?.accessToken : undefined;
  try {
    return (await send(method, path, body, opts, token)) as T;
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    // Jeton d'accès expiré : un rafraîchissement, puis un seul nouvel essai.
    if (e.status === 401 && authenticated && token) {
      if (await refreshSession()) {
        const fresh = (await sessionStore.get())?.accessToken;
        return (await send(method, path, body, opts, fresh)) as T;
      }
      throw e;
    }
    // Coupure réseau brève (fréquente sur mobile) : on retente les lectures une fois.
    if (e.status === 0 && e.code === 'NETWORK_ERROR' && method === 'GET') {
      await new Promise((r) => setTimeout(r, 1000));
      return (await send(method, path, body, opts, token)) as T;
    }
    throw e;
  }
}
