import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { emailService } from '../features/notifications/email.service';
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

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  isLoading: false,
  isInitialized: false,
  error: null,

  initialize: async () => {
    try {
      set({ isLoading: true });
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        const profile = await get().fetchProfile(session.user.id);
        set({ user: session.user, session, profile, isInitialized: true, isLoading: false });
      } else {
        set({ isInitialized: true, isLoading: false });
      }

      // Listen for auth changes
      supabase.auth.onAuthStateChange(async (event, session) => {
        if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session?.user) {
          const profile = await get().fetchProfile(session.user.id);
          set({ user: session.user, session, profile });
        } else if (event === 'SIGNED_OUT') {
          set({ user: null, session: null, profile: null });
        }
      });
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
