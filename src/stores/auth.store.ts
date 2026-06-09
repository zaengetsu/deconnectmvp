import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { emailService } from '../features/notifications/email.service';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type { Profile } from '../types/database.types';
import type { Session, User } from '@supabase/supabase-js';

interface AuthState {
  // State
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  fetchProfile: (userId: string) => Promise<Profile | null>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
  clearError: () => void;
}

// ── Singleton flags: ensure auth listeners are registered ONLY ONCE ──
// Without this, every call to initialize() stacks a new onAuthStateChange
// listener.  After N calls, a single TOKEN_REFRESHED event fires N
// fetchProfile() requests in parallel, saturating the Supabase client and
// making the entire app stop loading data.
let _authListenerRegistered = false;
let _appStateListenerRegistered = false;
let _networkListenerRegistered = false;
let _heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  isLoading: false,
  isInitialized: false,
  error: null,

  initialize: async () => {
    // If already initialized and listeners are active, skip entirely.
    // This prevents duplicate work on React re-renders / HMR.
    if (_authListenerRegistered && get().isInitialized) {
      return;
    }

    try {
      set({ isLoading: true });

      // Tente de lire la session (refresh automatique si token expiré)
      let { data: { session } } = await supabase.auth.getSession();

      // Si getSession retourne null, le réseau était peut-être pas prêt (app restart)
      // → on attend 1s et on réessaie UNE fois avant de conclure
      if (!session) {
        await new Promise(res => setTimeout(res, 1000));
        const retry = await supabase.auth.getSession();
        session = retry.data.session;
      }

      if (session?.user) {
        const profile = await get().fetchProfile(session.user.id);
        set({ user: session.user, session, profile, isInitialized: true, isLoading: false });
      } else {
        set({ isInitialized: true, isLoading: false });
      }

      // Mise à jour du store sur tout changement d'auth (login, logout, refresh)
      // CRITICAL: register ONLY ONCE — otherwise listeners pile up and
      // each TOKEN_REFRESHED fires N parallel fetchProfile() calls
      if (!_authListenerRegistered) {
        _authListenerRegistered = true;
        supabase.auth.onAuthStateChange(async (event, session) => {
          if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
            if (session?.user) {
              const profile = await get().fetchProfile(session.user.id);
              set({ user: session.user, session, profile });
            }
          } else if (event === 'SIGNED_OUT') {
            set({ user: null, session: null, profile: null });
          }
        });
      }

      // ── Session heartbeat ─────────────────────────────────────────
      // The Supabase JWT expires after ~1 hour. On iOS, the auto-refresh
      // mechanism can fail silently (WebSocket dies in background, network
      // changes). This heartbeat proactively refreshes the session every
      // 4 minutes, keeping the JWT alive and preventing the "dead app" state.
      if (!_heartbeatTimer) {
        _heartbeatTimer = setInterval(async () => {
          const currentUser = get().user;
          if (!currentUser) return; // not logged in

          try {
            const { data, error } = await supabase.auth.getSession();
            if (error || !data.session) {
              // Session lost — try to recover
              console.warn('[AuthStore] Heartbeat: session lost, attempting refresh...');
              const refresh = await supabase.auth.refreshSession();
              if (refresh.error || !refresh.data.session) {
                console.error('[AuthStore] Heartbeat: refresh failed — user will need to re-login');
              } else {
                set({ user: refresh.data.session.user, session: refresh.data.session });
                console.info('[AuthStore] Heartbeat: session recovered');
              }
            }
          } catch {
            // Network error — ignore, will retry in 4 minutes
          }
        }, 2 * 60 * 1000); // every 2 minutes
      }

      // Sur mobile : rafraîchit silencieusement au retour en premier plan
      // NE déconnecte JAMAIS — le refresh token est valide 7 jours
      // Une app mobile doit se comporter comme Instagram : pas de déco intempestive
      // ── Network recovery listener ─────────────────────────────────
      // iOS WKWebView bug: when the network drops (even briefly), ALL
      // subsequent fetch() calls fail with "La connexion réseau a été perdue"
      // until reconnected. We use the standard browser 'online' event (works
      // on iOS 13+ WKWebView) to detect recovery and force re-init.
      // No native plugin needed — window.addEventListener is sufficient.
      if (!_networkListenerRegistered) {
        _networkListenerRegistered = true;
        window.addEventListener('online', async () => {
          console.log('[AuthStore] Network came back online — reconnecting...');
          // Wait for the connection to stabilize
          await new Promise(res => setTimeout(res, 800));
          try {
            const { data, error } = await supabase.auth.refreshSession();
            if (!error && data.session?.user) {
              set({ user: data.session.user, session: data.session });
              console.info('[AuthStore] Session refreshed after network restore');
            }
            supabase.realtime.disconnect();
            supabase.realtime.connect();
            console.info('[AuthStore] Realtime reconnected after network restore');
          } catch (e) {
            console.warn('[AuthStore] Network restore recovery failed:', e);
          }
        });
        window.addEventListener('offline', () => {
          console.warn('[AuthStore] Network went offline');
        });
      }

      if (Capacitor.isNativePlatform() && !_appStateListenerRegistered) {
        _appStateListenerRegistered = true;
        App.addListener('appStateChange', async ({ isActive }) => {
          if (!isActive) return;

          // Délai pour laisser iOS établir la connexion réseau
          await new Promise(res => setTimeout(res, 500));

          try {
            // 1) Refresh the auth session (JWT may have expired in background)
            const { data, error } = await supabase.auth.refreshSession();
            if (!error && data.session?.user) {
              set({ user: data.session.user, session: data.session });
            }

            // 2) Reconnect Realtime — iOS kills WebSocket connections after
            //    ~30 seconds in background. Without this, the Realtime channels
            //    go dead and any postgres_changes subscriptions stop working,
            //    which also clogs the Supabase client over time.
            try {
              supabase.realtime.disconnect();
              supabase.realtime.connect();
              console.info('[AuthStore] Realtime reconnected after foreground resume');
            } catch {
              // Realtime reconnect failed — non-fatal
            }
          } catch {
            // Ignorer les erreurs réseau temporaires — l'app continue à fonctionner
          }
        });
      }
    } catch (error) {
      set({ isInitialized: true, isLoading: false, error: 'Erreur d\'initialisation' });
    }
  },

  signIn: async (email: string, password: string) => {
    try {
      set({ isLoading: true, error: null });
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) throw error;
      if (!data.user) throw new Error('Aucun utilisateur trouvé');

      const profile = await get().fetchProfile(data.user.id);
      set({ user: data.user, session: data.session, profile, isLoading: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur de connexion';
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  signUp: async (email: string, password: string, fullName: string) => {
    try {
      set({ isLoading: true, error: null });

      // Pass fullName as metadata so the DB trigger can use it
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, role: 'parent' } },
      });

      // Supabase free plan: rate-limit on confirmation email → show "check email" screen
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

      // Profile + subscription are created automatically by the DB trigger handle_new_user().
      // Just send the welcome email via Brevo (fire and forget).
      emailService.sendWelcome(email, fullName);

      if (data.session) {
        // Email confirmation disabled or already confirmed — log user in immediately
        const profile = await get().fetchProfile(data.user.id);
        set({ user: data.user, session: data.session, profile, isLoading: false });
      } else {
        // Confirmation email sent — show confirmation screen
        set({ isLoading: false, error: 'CONFIRM_EMAIL' });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur d\'inscription';
      set({ isLoading: false, error: message });
      throw error;
    }
  },

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

  resetPassword: async (email: string) => {
    try {
      set({ isLoading: true, error: null });
      // Use our custom Brevo Edge Function — bypasses Supabase email rate limits
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

  fetchProfile: async (userId: string): Promise<Profile | null> => {
    // Try to get profile
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle(); // maybeSingle() returns null instead of throwing on 0 rows

    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }

    // Profile exists — return it
    if (data) return data;

    // Profile missing (user created before migration 008 trigger) — create it now
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

  updateProfile: async (updates: Partial<Profile>) => {
    try {
      set({ isLoading: true, error: null });
      const user = get().user;
      if (!user) throw new Error('Non connecté');

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

      if (error) throw error;

      const profile = await get().fetchProfile(user.id);
      set({ profile, isLoading: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur de mise à jour';
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
}));
