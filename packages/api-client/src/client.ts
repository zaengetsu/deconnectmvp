/** Erreur renvoyée par l'API : { code, message, details } (voir HttpErrorFilter). */
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

export interface Session {
  accessToken: string;
  refreshToken: string;
}

/** Où garder la session : localStorage côté web, mémoire dans les tests. */
export interface SessionStore {
  load(): Session | null;
  save(session: Session | null): void;
}

export class MemorySessionStore implements SessionStore {
  constructor(private session: Session | null = null) {}
  load() {
    return this.session;
  }
  save(session: Session | null) {
    this.session = session;
  }
}

export class LocalSessionStore implements SessionStore {
  constructor(private readonly key: string) {}
  load(): Session | null {
    try {
      const raw = globalThis.localStorage?.getItem(this.key);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  }
  save(session: Session | null) {
    try {
      if (session) globalThis.localStorage?.setItem(this.key, JSON.stringify(session));
      else globalThis.localStorage?.removeItem(this.key);
    } catch {
      /* stockage indisponible (navigation privée) : la session reste en mémoire */
    }
  }
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | null | undefined | string[]>;
  body?: unknown;
  /** Pas d'en-tête Authorization (connexion, invitation…). */
  anonymous?: boolean;
  signal?: AbortSignal;
}

export interface ClientOptions {
  baseUrl: string;
  store?: SessionStore;
  fetch?: typeof fetch;
  /** Appelé quand la session est perdue (rafraîchissement impossible) : redirection vers la connexion. */
  onSessionExpired?: () => void;
}

export function buildQuery(query?: RequestOptions['query']): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

/**
 * Transport HTTP : jeton d'accès court, rafraîchi automatiquement (une seule fois en parallèle)
 * quand l'API répond 401 ; la rotation du jeton de rafraîchissement est gérée par l'API.
 */
export class HttpClient {
  readonly baseUrl: string;
  private readonly store: SessionStore;
  private readonly fetchFn: typeof fetch;
  private refreshing: Promise<boolean> | null = null;
  private readonly listeners = new Set<(s: Session | null) => void>();

  constructor(private readonly options: ClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.store = options.store ?? new MemorySessionStore();
    this.fetchFn = options.fetch ?? ((...args) => fetch(...args));
  }

  get session(): Session | null {
    return this.store.load();
  }

  setSession(session: Session | null) {
    this.store.save(session);
    for (const l of this.listeners) l(session);
  }

  onSessionChange(fn: (s: Session | null) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  url(path: string, query?: RequestOptions['query']) {
    return `${this.baseUrl}${path}${buildQuery(query)}`;
  }

  async request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const res = await this.send(method, path, opts);
    if (res.status === 204) return undefined as T;
    const type = res.headers.get('content-type') ?? '';
    return (type.includes('application/json') ? await res.json() : await res.text()) as T;
  }

  /** Téléchargement authentifié (CSV) : renvoie le contenu brut et le nom de fichier proposé. */
  async download(path: string, query?: RequestOptions['query']): Promise<{ blob: Blob; filename: string }> {
    const res = await this.send('GET', path, { query });
    const disposition = res.headers.get('content-disposition') ?? '';
    const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? 'export.csv';
    return { blob: await res.blob(), filename };
  }

  private async send(method: string, path: string, opts: RequestOptions, retried = false): Promise<Response> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    const session = this.session;
    if (!opts.anonymous && session) headers.authorization = `Bearer ${session.accessToken}`;
    let res: Response;
    try {
      res = await this.fetchFn(this.url(path, opts.query), {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: opts.signal,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      throw new ApiError(0, 'NETWORK_ERROR', 'Connexion au serveur impossible. Vérifiez votre réseau.');
    }
    if (res.status === 401 && !opts.anonymous && session && !retried) {
      if (await this.refresh()) return this.send(method, path, opts, true);
    }
    if (!res.ok) throw await toError(res);
    return res;
  }

  /** Un seul rafraîchissement à la fois, partagé par toutes les requêtes en attente. */
  refresh(): Promise<boolean> {
    this.refreshing ??= this.doRefresh().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  private async doRefresh(): Promise<boolean> {
    const session = this.session;
    if (!session) return false;
    try {
      const res = await this.fetchFn(this.url('/v1/auth/refresh'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as Session;
      this.setSession({ accessToken: body.accessToken, refreshToken: body.refreshToken });
      return true;
    } catch {
      this.setSession(null);
      this.options.onSessionExpired?.();
      return false;
    }
  }
}

async function toError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { code?: string; message?: string | string[]; details?: unknown };
    const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    return new ApiError(res.status, body.code ?? `HTTP_${res.status}`, message ?? defaultMessage(res.status), body.details);
  } catch {
    return new ApiError(res.status, `HTTP_${res.status}`, defaultMessage(res.status));
  }
}

export function defaultMessage(status: number): string {
  if (status === 401) return 'Votre session a expiré, reconnectez-vous.';
  if (status === 403) return "Vous n'avez pas accès à cette action.";
  if (status === 404) return 'Élément introuvable.';
  if (status === 429) return 'Trop de tentatives, réessayez dans quelques minutes.';
  if (status >= 500) return 'Le serveur rencontre un problème. Réessayez dans un instant.';
  return 'La requête a échoué.';
}

/** Détails de validation zod → message par champ ({ path: 'title', message }). */
export function fieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || !Array.isArray(err.details)) return {};
  const out: Record<string, string> = {};
  for (const d of err.details as { path?: string | (string | number)[]; message?: string }[]) {
    const key = (Array.isArray(d.path) ? d.path.join('.') : d.path) || '_';
    out[key] ??= d.message ?? 'Valeur invalide';
  }
  return out;
}
