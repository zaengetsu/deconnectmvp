import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { emailService } from '../features/notifications/email.service';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type { Profile } from '../types/database.types';
import type { Session, User } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  fetchProfile: (userId: string) => Promise<Profile | null>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
  /** Relit la session Supabase et aligne le store (après une connexion faite hors du store, ex. session enfant). */
  syncSession: () => Promise<void>;
  clearError: () => void;
}

// ── Singleton flags ───────────────────────────────────────────────────
let _authListenerRegistered    = false;
let _appStateListenerRegistered = false;
let _networkListenerRegistered  = false;
let _heartbeatTimer: ReturnType<typeof setInterval> | null = null;

// ── Mutex: prevent concurrent initialize() calls ─────────────────────
// React StrictMode (dev) intentionally calls useEffect TWICE to detect
// side effects. Without this mutex, two getSession() + refreshSession()
// fire simultaneously, creating a token-refresh loop at startup.
let _isInitializing = false;
let _initPromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  isLoading: false,
  isInitialized: false,
  error: null,

  // ── initialize ─────────────────────────────────────────────────────
  initialize: async () => {
    // Already fully initialized — nothing to do
    if (_authListenerRegistered && get().isInitialized) return;

    // Already running (React StrictMode double-invoke) — return shared promise
    if (_isInitializing && _initPromise) return _initPromise;

    _isInitializing = true;
    _initPromise = (async () => {
      try {
        set({ isLoading: true });

        // ── Watchdog: never stay stuck on splash > 5s ────────────────
        const watchdog = setTimeout(() => {
          if (!get().isInitialized) {
            console.warn('[AuthStore] Watchdog: 5s — forcing isInitialized=true');
            set({ isInitialized: true, isLoading: false });
          }
        }, 5000);

        // Read session from storage (auto-refreshes expired JWT if needed)
        let { data: { session } } = await supabase.auth.getSession();

        // If null, network may not have been ready — retry once after 1s
        if (!session) {
          await new Promise(res => setTimeout(res, 1000));
          const retry = await supabase.auth.getSession();
          session = retry.data.session;
        }

        if (session?.user) {
          // Session enfant (anonyme) : pas de profil parent — surtout pas d'auto-création
          const profile = session.user.is_anonymous ? null : await get().fetchProfile(session.user.id);
          set({ user: session.user, session, profile, isInitialized: true, isLoading: false });
        } else {
          set({ isInitialized: true, isLoading: false });
        }

        clearTimeout(watchdog);

        // ── Auth state listener (register ONCE) ──────────────────────
        if (!_authListenerRegistered) {
          _authListenerRegistered = true;
          supabase.auth.onAuthStateChange(async (event, session) => {
            if (
              event === 'SIGNED_IN' ||
              event === 'USER_UPDATED' ||
              event === 'TOKEN_REFRESHED'
            ) {
              if (session?.user) {
                const profile = session.user.is_anonymous ? null : await get().fetchProfile(session.user.id);
                set({ user: session.user, session, profile });
              }
            } else if (event === 'SIGNED_OUT') {
              set({ user: null, session: null, profile: null });
            }
          });
        }

        // ── Heartbeat: proactive JWT refresh every 2 min ─────────────
        if (!_heartbeatTimer) {
          _heartbeatTimer = setInterval(async () => {
            if (!get().user) return;
            try {
              const { data, error } = await supabase.auth.getSession();
              if (error || !data.session) {
                const refresh = await supabase.auth.refreshSession();
                if (!refresh.error && refresh.data.session) {
                  set({ user: refresh.data.session.user, session: refresh.data.session });
                }
              }
            } catch { /* network error — retry next interval */ }
          }, 2 * 60 * 1000);
        }

        // ── Network recovery listener ─────────────────────────────────
        if (!_networkListenerRegistered) {
          _networkListenerRegistered = true;
          window.addEventListener('online', async () => {
            await new Promise(res => setTimeout(res, 800));
            try {
              const { data, error } = await supabase.auth.refreshSession();
              if (!error && data.session?.user) {
                set({ user: data.session.user, session: data.session });
              }
              supabase.realtime.disconnect();
              supabase.realtime.connect();
            } catch { /* ignore */ }
          });
          window.addEventListener('offline', () => {
            console.warn('[AuthStore] Network went offline');
          });
        }

        // ── App foreground resume (native only) ───────────────────────
        if (Capacitor.isNativePlatform() && !_appStateListenerRegistered) {
          _appStateListenerRegistered = true;
          App.addListener('appStateChange', async ({ isActive }) => {
            if (!isActive) return;
            await new Promise(res => setTimeout(res, 500));
            try {
              const { data, error } = await supabase.auth.refreshSession();
              if (!error && data.session?.user) {
                set({ user: data.session.user, session: data.session });
              }
              try {
                supabase.realtime.disconnect();
                supabase.realtime.connect();
              } catch { /* non-fatal */ }
            } catch { /* ignore transient errors */ }
          });
        }

      } catch (err) {
        console.error('[AuthStore] initialize error:', err);
        set({ isInitialized: true, isLoading: false, error: 'Erreur d\'initialisation' });
      }
    })();

    _initPromise.finally(() => {
      _isInitializing = false;
      _initPromise = null;
    });

    return _initPromise;
  },

  // ── signIn ─────────────────────────────────────────────────────────
  signIn: async (email: string, password: string) => {
    try {
      set({ isLoading: true, error: null });
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.user) throw new Error('Aucun utilisateur trouvé');
      const profile = await get().fetchProfile(data.user.id);
      set({ user: data.user, session: data.session, profile, isLoading: false });

      // Sécurité : on prévient par email à chaque nouvelle connexion (5.14).
      // Volontairement sans await : une erreur d'email ne doit jamais
      // empêcher quelqu'un de se connecter.
      if (data.user.email) {
        emailService.sendNewLogin(
          data.user.email,
          profile?.full_name ?? '',
          Capacitor.isNativePlatform() ? `l'application ${Capacitor.getPlatform()}` : 'un navigateur web',
        ).catch(() => {});
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur de connexion';
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  // ── signUp ─────────────────────────────────────────────────────────
  signUp: async (email: string, password: string, fullName: string) => {
    try {
      set({ isLoading: true, error: null });
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, role: 'parent' } },
      });

      if (error) {
        const isRateLimit =
          error.status === 429 ||
          (error as any).code === 'over_email_send_rate_limit' ||
          error.message.toLowerCase().includes('rate limit') ||
          error.message.toLowerCase().includes('email rate');
        if (isRateLimit) {
          set({ isLoading: false, error: 'CONFIRM_EMAIL' });
          return;
        }
        throw error;
      }
      if (!data.user) throw new Error('Erreur lors de la création du compte');

      emailService.sendWelcome(email, fullName);

      if (data.session) {
        const profile = await get().fetchProfile(data.user.id);
        set({ user: data.user, session: data.session, profile, isLoading: false });
      } else {
        set({ isLoading: false, error: 'CONFIRM_EMAIL' });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur d\'inscription';
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  // ── signOut ────────────────────────────────────────────────────────
  signOut: async () => {
    try {
      set({ isLoading: true });
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      set({ user: null, session: null, profile: null, isLoading: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur de déconnexion';
      set({ isLoading: false, error: message });
    }
  },

  // ── resetPassword ──────────────────────────────────────────────────
  resetPassword: async (email: string) => {
    try {
      set({ isLoading: true, error: null });
      const { error } = await supabase.functions.invoke('reset-password', {
        body: { action: 'request', email },
      });
      if (error) throw error;
      set({ isLoading: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur de réinitialisation';
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  // ── fetchProfile ───────────────────────────────────────────────────
  fetchProfile: async (userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }

    if (data) {
      // Après un changement d'adresse confirmé, auth.users.email est la source
      // de vérité : on réaligne profiles.email silencieusement.
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser?.email && authUser.email !== data.email) {
        await supabase.from('profiles').update({ email: authUser.email }).eq('id', userId);
        return { ...data, email: authUser.email };
      }
      return data;
    }

    // Profile missing — auto-create
    console.warn('[AuthStore] Profile missing — auto-creating for:', userId);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: created, error: createErr } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        email: user?.email ?? '',
        full_name: user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'Utilisateur',
        role: user?.user_metadata?.role ?? 'parent',
      }, { onConflict: 'id' })
      .select()
      .maybeSingle();

    if (createErr) {
      console.error('[AuthStore] Failed to auto-create profile:', createErr);
      return null;
    }
    return created;
  },

  // ── updateProfile ──────────────────────────────────────────────────
  updateProfile: async (updates: Partial<Profile>) => {
    try {
      set({ isLoading: true, error: null });
      const user = get().user;
      if (!user) throw new Error('Non connecté');
      const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
      if (error) throw error;
      const profile = await get().fetchProfile(user.id);
      set({ profile, isLoading: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur de mise à jour';
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  // ── syncSession ────────────────────────────────────────────────────
  syncSession: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { set({ user: null, session: null, profile: null }); return; }
    const profile = session.user.is_anonymous ? null : await get().fetchProfile(session.user.id);
    set({ user: session.user, session, profile });
  },

  // ── clearError ─────────────────────────────────────────────────────
  clearError: () => set({ error: null }),
}));
