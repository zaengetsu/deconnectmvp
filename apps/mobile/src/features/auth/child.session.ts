import { Preferences } from '@capacitor/preferences';
import { api, ApiError } from '../../lib/api';
import { devicePushToken, sessionStore } from '../../lib/session';
import { toChild } from '../children/children.service';
import type { Child } from '../../types/database.types';

/**
 * Session enfant — identité propre à l'appareil de l'enfant, émise par l'API.
 *
 * Le lien QR (ou code court) puis le PIN ouvrent une session `child:<id>` : l'enfant
 * ne porte jamais le jeton de son parent. Un appareil = une session à la fois : passer
 * en mode enfant depuis le téléphone d'un parent ferme la session du parent.
 */

/** Dernier enfant relié à cet appareil : permet de le reconnecter avec son seul PIN. */
const CHILD_SESSION_KEY = 'dc_child_session';

export interface ChildSessionRecord {
  childId: string;
}

export interface ChildLoginResult {
  success: boolean;
  child?: Child;
  error?: string;
  attempts_left?: number;
  locked_until?: string;
}

interface ChildAuthResponse {
  accessToken: string;
  refreshToken: string;
  child: { id: string; parentId: string } & Record<string, unknown>;
  parentName?: string | null;
}

async function openChildSession(res: ChildAuthResponse): Promise<Child> {
  // Session parent éventuelle sur ce téléphone : révoquée côté serveur avant d'être remplacée.
  const previous = await sessionStore.get();
  if (previous?.kind === 'parent') {
    await api('POST', '/v1/auth/logout', { refreshToken: previous.refreshToken }).catch(() => undefined);
  }
  await sessionStore.set({ kind: 'child', accessToken: res.accessToken, refreshToken: res.refreshToken, subjectId: res.child.id, parentId: res.child.parentId });
  await Preferences.set({ key: CHILD_SESSION_KEY, value: JSON.stringify({ childId: res.child.id } as ChildSessionRecord) }).catch(() => undefined);
  const child = toChild(res.child);
  try { localStorage.setItem('deconnect_child', JSON.stringify(child)); } catch { /* stockage indisponible */ }
  return child;
}

function failure(e: unknown): ChildLoginResult {
  if (e instanceof ApiError) {
    const details = e.details as { lockedUntil?: string } | undefined;
    return { success: false, error: e.message, ...(details?.lockedUntil ? { locked_until: details.lockedUntil } : e.code === 'PIN_LOCKED' ? { locked_until: '' } : {}) };
  }
  return { success: false, error: 'Connexion impossible. Vérifie ta connexion internet.' };
}

export const childSession = {
  /** true si la session courante est une session enfant. */
  isChildUser(user: { is_anonymous?: boolean } | null | undefined): boolean {
    return !!user?.is_anonymous;
  },

  /** Connexion par PIN — l'enfant choisit son profil (téléphone familial) ou se reconnecte. */
  async login(childId: string, pin: string, deviceId?: string): Promise<ChildLoginResult> {
    try {
      const res = await api<ChildAuthResponse>('POST', '/v1/auth/child/login', { childId, pin, ...(deviceId ? { deviceId } : {}) }, { auth: false });
      return { success: true, child: await openChildSession(res) };
    } catch (e) {
      return failure(e);
    }
  },

  /** Lien initial par QR code ou code court : pose le PIN et relie l'appareil. */
  async claimLink(token: string, pin: string, deviceId?: string): Promise<{ success: boolean; child?: Child; parent_name?: string | null; error?: string }> {
    try {
      const res = await api<ChildAuthResponse>('POST', '/v1/auth/child/link', { code: token, pin, ...(deviceId ? { deviceId } : {}) }, { auth: false });
      return { success: true, child: await openChildSession(res), parent_name: res.parentName ?? null };
    } catch (e) {
      return failure(e);
    }
  },

  /** Enfant rattaché à la session courante (après un redémarrage de l'app). */
  async restore(): Promise<Child | null> {
    const s = await sessionStore.get();
    if (s?.kind !== 'child') return null;
    try {
      const me = await api<{ kind: string; child?: unknown }>('GET', '/v1/auth/me');
      return me.kind === 'child' && me.child ? toChild(me.child) : null;
    } catch {
      return null;
    }
  },

  /** Dernier enfant relié à cet appareil (reconnexion par PIN sans le parent). */
  async lastChildId(): Promise<string | null> {
    try {
      const { value } = await Preferences.get({ key: CHILD_SESSION_KEY });
      return value ? ((JSON.parse(value) as ChildSessionRecord).childId ?? null) : null;
    } catch {
      return null;
    }
  },

  /**
   * Enfant déjà relié à cet appareil (mémorisé à la liaison) : après une mise à jour de l'app ou
   * une session expirée, il se reconnecte avec son seul PIN, sans rescanner de QR code.
   */
  rememberedChild(): Child | null {
    try {
      const raw = localStorage.getItem('deconnect_child');
      const child = raw ? (JSON.parse(raw) as Child) : null;
      return child?.id ? child : null;
    } catch {
      return null;
    }
  },

  /** Fin de session enfant (retour à l'écran de connexion parent). */
  async end(): Promise<void> {
    const s = await sessionStore.get();
    const pushToken = devicePushToken.get();
    if (s) await api('POST', '/v1/auth/logout', { refreshToken: s.refreshToken, ...(pushToken ? { pushToken } : {}) }).catch(() => undefined);
    await Preferences.remove({ key: CHILD_SESSION_KEY }).catch(() => undefined);
    try { localStorage.removeItem('deconnect_child'); localStorage.removeItem('deconnect_child_id'); } catch { /* stockage indisponible */ }
    await sessionStore.clear();
  },
};
