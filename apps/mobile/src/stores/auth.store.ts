import { create } from 'zustand';
import { api, ApiError } from '../lib/api';
import { compact, snake } from '../lib/case';
import { devicePushToken, sessionStore, type StoredSession } from '../lib/session';
import type { Profile } from '../types/database.types';

/**
 * Utilisateur de la session courante. Côté enfant, `id` est l'identifiant de l'enfant et
 * `is_anonymous` vaut true (nom hérité de Supabase, gardé pour ne pas toucher aux écrans).
 */
export interface AuthUser {
  id: string;
  email: string | null;
  is_anonymous: boolean;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; fullName: string | null; role: string };
}

interface AuthState {
  user: AuthUser | null;
  session: StoredSession | null;
  profile: Profile | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  fetchProfile: (userId?: string) => Promise<Profile | null>;
  updateProfile: (updates: Partial<Profile> & Record<string, unknown>) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  changeEmail: (email: string, password: string) => Promise<void>;
  /** Aligne le store sur la session stockée (après une connexion enfant, par exemple). */
  syncSession: () => Promise<void>;
  clearError: () => void;
}

function userOf(s: StoredSession | null): AuthUser | null {
  if (!s) return null;
  return s.kind === 'child' ? { id: s.subjectId, email: null, is_anonymous: true } : { id: s.subjectId, email: s.email ?? null, is_anonymous: false };
}

const messageOf = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

let initPromise: Promise<void> | null = null;
let listening = false;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  isLoading: false,
  isInitialized: false,
  error: null,

  initialize: () => {
    if (get().isInitialized) return Promise.resolve();
    initPromise ??= (async () => {
      set({ isLoading: true });
      // Garde-fou : le splash ne reste jamais plus de 5 s.
      const watchdog = setTimeout(() => {
        if (!get().isInitialized) set({ isInitialized: true, isLoading: false });
      }, 5000);
      try {
        if (!listening) {
          listening = true;
          // Session effacée ailleurs (jeton révoqué, déconnexion enfant…) : l'état suit.
          sessionStore.onChange((s) => {
            if (!s) set({ user: null, session: null, profile: null });
          });
        }
        const s = await sessionStore.get();
        const profile = s?.kind === 'parent' ? await get().fetchProfile(s.subjectId) : null;
        const current = await sessionStore.get(); // peut avoir été effacée si le jeton était révoqué
        set({ user: userOf(current), session: current, profile, isInitialized: true, isLoading: false });
      } catch (err) {
        console.error('[AuthStore] initialize error:', err);
        set({ isInitialized: true, isLoading: false, error: "Erreur d'initialisation" });
      } finally {
        clearTimeout(watchdog);
        initPromise = null;
      }
    })();
    return initPromise;
  },

  signIn: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api<AuthResponse>('POST', '/v1/auth/login', { email: email.trim(), password }, { auth: false });
      // L'API envoie elle-même l'email « nouvelle connexion » quand l'appareil est inconnu.
      await openParentSession(res);
      const profile = await get().fetchProfile(res.user.id);
      set({ user: userOf(await sessionStore.get()), session: await sessionStore.get(), profile, isLoading: false });
    } catch (e) {
      set({ isLoading: false, error: messageOf(e, 'Erreur de connexion') });
      throw e;
    }
  },

  signUp: async (email, password, fullName) => {
    set({ isLoading: true, error: null });
    try {
      // Compte actif immédiatement ; l'email de bienvenue part du serveur (événement user.registered).
      const res = await api<AuthResponse>('POST', '/v1/auth/register', { email: email.trim(), password, fullName: fullName.trim() }, { auth: false });
      await openParentSession(res);
      const profile = await get().fetchProfile(res.user.id);
      set({ user: userOf(await sessionStore.get()), session: await sessionStore.get(), profile, isLoading: false });
    } catch (e) {
      set({ isLoading: false, error: messageOf(e, "Erreur d'inscription") });
      throw e;
    }
  },

  signOut: async () => {
    set({ isLoading: true });
    const s = await sessionStore.get();
    if (s) {
      const pushToken = devicePushToken.get();
      await api('POST', '/v1/auth/logout', compact({ refreshToken: s.refreshToken, pushToken: pushToken ?? undefined })).catch(() => undefined);
    }
    await sessionStore.clear();
    set({ user: null, session: null, profile: null, isLoading: false });
  },

  resetPassword: async (email) => {
    set({ isLoading: true, error: null });
    try {
      await api('POST', '/v1/auth/password/forgot', { email: email.trim() }, { auth: false });
      set({ isLoading: false });
    } catch (e) {
      set({ isLoading: false, error: messageOf(e, 'Erreur de réinitialisation') });
      throw e;
    }
  },

  fetchProfile: async () => {
    try {
      return snake<Profile>(await api('GET', '/v1/profile'));
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 0)) console.error('[AuthStore] profil indisponible :', e);
      return null;
    }
  },

  updateProfile: async (updates) => {
    set({ isLoading: true, error: null });
    try {
      const { id: _id, email: _email, role: _role, created_at: _c, updated_at: _u, ...rest } = updates;
      await api('PATCH', '/v1/profile', compact(Object.fromEntries(Object.entries(rest).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), v]))));
      set({ profile: await get().fetchProfile(), isLoading: false });
    } catch (e) {
      set({ isLoading: false, error: messageOf(e, 'Erreur de mise à jour') });
      throw e;
    }
  },

  changePassword: async (currentPassword, newPassword) => {
    const res = await api<AuthResponse>('POST', '/v1/auth/password/change', { currentPassword, newPassword });
    // Les autres sessions sont fermées ; celle-ci reçoit de nouveaux jetons.
    await openParentSession(res);
  },

  changeEmail: async (email, password) => {
    const res = await api<{ user: AuthResponse['user'] }>('POST', '/v1/auth/email', { email: email.trim(), password });
    const s = await sessionStore.get();
    if (s) await sessionStore.set({ ...s, email: res.user.email });
    set({ user: userOf(await sessionStore.get()), session: await sessionStore.get(), profile: await get().fetchProfile() });
  },

  syncSession: async () => {
    const s = await sessionStore.get();
    const profile = s?.kind === 'parent' ? await get().fetchProfile(s.subjectId) : null;
    set({ user: userOf(s), session: s, profile });
  },

  clearError: () => set({ error: null }),
}));

async function openParentSession(res: AuthResponse): Promise<void> {
  await sessionStore.set({ kind: 'parent', accessToken: res.accessToken, refreshToken: res.refreshToken, subjectId: res.user.id, email: res.user.email });
}
