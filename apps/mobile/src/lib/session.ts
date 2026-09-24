import { Preferences } from '@capacitor/preferences';

/**
 * Session de l'appareil, émise par l'API Rekonect (plus de Supabase Auth).
 *
 *  - parent : connexion email + mot de passe ;
 *  - enfant : lien QR / code court puis PIN (jeton `child:<id>`).
 *
 * Un appareil porte une seule session à la fois. Elle est gardée dans les
 * Preferences Capacitor (NSUserDefaults / SharedPreferences) : le localStorage
 * d'une WebView peut être vidé par le système entre deux lancements.
 */
export interface StoredSession {
  kind: 'parent' | 'child';
  accessToken: string;
  refreshToken: string;
  /** Parent : identifiant du compte. Enfant : identifiant de l'enfant. */
  subjectId: string;
  email?: string | null;
  parentId?: string | null;
}

const KEY = 'rk_session_v1';
let cache: StoredSession | null | undefined;
const listeners = new Set<(s: StoredSession | null) => void>();

async function read(): Promise<string | null> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    if (value != null) return value;
  } catch { /* Preferences indisponible (navigateur sans plugin) */ }
  try { return localStorage.getItem(KEY); } catch { return null; }
}

async function write(value: string | null): Promise<void> {
  try {
    if (value == null) await Preferences.remove({ key: KEY });
    else await Preferences.set({ key: KEY, value });
  } catch { /* repli ci-dessous */ }
  try {
    if (value == null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, value);
  } catch { /* stockage indisponible */ }
}

export const sessionStore = {
  /** Session courante (lue une fois depuis le stockage, puis gardée en mémoire). */
  async get(): Promise<StoredSession | null> {
    if (cache !== undefined) return cache;
    const raw = await read();
    try {
      const parsed = raw ? (JSON.parse(raw) as StoredSession) : null;
      cache = parsed?.accessToken && parsed.refreshToken && parsed.kind ? parsed : null;
    } catch {
      cache = null;
    }
    return cache;
  },

  /** Valeur en mémoire, sans attendre le stockage (null avant la première lecture). */
  peek(): StoredSession | null {
    return cache ?? null;
  },

  async set(session: StoredSession | null): Promise<void> {
    cache = session;
    await write(session ? JSON.stringify(session) : null);
    for (const l of listeners) l(session);
  },

  /** Remplace les jetons après un rafraîchissement, sans toucher au reste. */
  async updateTokens(accessToken: string, refreshToken: string): Promise<void> {
    const current = await sessionStore.get();
    if (!current) return;
    await sessionStore.set({ ...current, accessToken, refreshToken });
  },

  clear(): Promise<void> {
    return sessionStore.set(null);
  },

  onChange(fn: (s: StoredSession | null) => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Tests uniquement : oublie la valeur en mémoire (les abonnés restent). */
  __reset(): void {
    cache = undefined;
  },
};

/** Jeton push de cet appareil : retiré du compte à la déconnexion pour ne plus recevoir ses notifications. */
export const devicePushToken = {
  get(): string | null {
    try { return localStorage.getItem('rk_push_token'); } catch { return null; }
  },
  set(token: string): void {
    try { localStorage.setItem('rk_push_token', token); } catch { /* stockage indisponible */ }
  },
};
