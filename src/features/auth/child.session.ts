import { supabase } from '../../lib/supabase';
import { Preferences } from '@capacitor/preferences';
import type { Child } from '../../types/database.types';

/**
 * Session enfant — identité propre à l'appareil enfant.
 *
 * L'espace enfant ne s'appuie PLUS sur la session du parent (« pont » retiré).
 * L'appareil enfant ouvre une session Supabase anonyme, que le lien QR ou la
 * connexion PIN rattache à `children.auth_user_id`. Toutes les policies RLS
 * enfant (migration 024) sont scopées sur cette identité.
 *
 * Conséquence assumée : un appareil = une session à la fois. Passer en mode
 * enfant depuis le téléphone d'un parent déconnecte le parent.
 */

const CHILD_SESSION_KEY = 'dc_child_session';

export interface ChildSessionRecord {
  childId: string;
  authUserId: string;
}

export interface ChildLoginResult {
  success: boolean;
  child?: Child;
  error?: string;
  attempts_left?: number;
  locked_until?: string;
}

/** Ouvre (ou réutilise) une session anonyme et renvoie son uid. */
async function ensureAnonSession(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.user?.is_anonymous) return session.user.id;

  // Session parent en cours → on la ferme : l'enfant ne doit jamais
  // porter le jeton du parent.
  if (session) await supabase.auth.signOut();

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    console.error('[ChildSession] signInAnonymously failed:', error);
    throw new Error(describeAnonError(error));
  }
  return data.user.id;
}

/** Message utile plutôt que « vérifie ta connexion » pour tout. */
function describeAnonError(error: { message?: string; status?: number } | null): string {
  const m = (error?.message ?? '').toLowerCase();
  if (m.includes('anonymous') && (m.includes('disabled') || m.includes('not enabled'))) {
    return "Les connexions enfant ne sont pas activées sur le serveur (Supabase → Authentication → Providers → « Anonymous sign-ins »). Demande à un parent de l'activer.";
  }
  if (m.includes('rate') || error?.status === 429) {
    return 'Trop de tentatives pour le moment. Réessaie dans une minute.';
  }
  if (m.includes('fetch') || m.includes('network') || error?.status === 0 || !error?.message) {
    return 'Connexion impossible. Vérifie ta connexion internet.';
  }
  return `Connexion impossible : ${error?.message}`;
}

export const childSession = {
  /** true si la session courante est une session enfant. */
  isChildUser(user: { is_anonymous?: boolean } | null | undefined): boolean {
    return !!user?.is_anonymous;
  },

  /** Connexion par PIN — lie l'appareil à l'enfant. */
  async login(childId: string, pin: string): Promise<ChildLoginResult> {
    let authUserId: string;
    try { authUserId = await ensureAnonSession(); }
    catch (e) { return { success: false, error: (e as Error).message }; }

    const { data, error } = await supabase.rpc('child_pin_login', {
      p_child_id: childId,
      p_pin: pin,
      p_auth_user_id: authUserId,
    });

    if (error) {
      await supabase.auth.signOut();
      return { success: false, error: error.message };
    }

    const result = data as ChildLoginResult;

    if (result?.success) {
      await Preferences.set({
        key: CHILD_SESSION_KEY,
        value: JSON.stringify({ childId, authUserId } as ChildSessionRecord),
      });
    } else {
      // PIN refusé : on ne laisse pas traîner une session anonyme orpheline
      await supabase.auth.signOut();
    }

    return result;
  },

  /** Lien initial par QR code — pose le PIN et lie l'appareil. */
  async claimLink(token: string, pin: string, deviceId?: string) {
    let authUserId: string;
    try { authUserId = await ensureAnonSession(); }
    catch (e) { return { success: false, error: (e as Error).message }; }

    const { data, error } = await supabase.rpc('claim_child_link_token', {
      p_token: token,
      p_pin: pin,
      p_device_id: deviceId ?? null,
      p_auth_user_id: authUserId,
    });

    if (error) {
      await supabase.auth.signOut();
      return { success: false, error: error.message };
    }

    const result = data as { success: boolean; child?: Child; parent_name?: string; error?: string };

    if (result?.success && result.child) {
      await Preferences.set({
        key: CHILD_SESSION_KEY,
        value: JSON.stringify({ childId: result.child.id, authUserId } as ChildSessionRecord),
      });
    } else {
      await supabase.auth.signOut();
    }

    return result;
  },

  /** Récupère l'enfant rattaché à la session anonyme courante (après reload). */
  async restore(): Promise<Child | null> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.is_anonymous) return null;

    const { data, error } = await supabase
      .from('children')
      .select('*')
      .eq('auth_user_id', session.user.id)
      .maybeSingle();

    if (error || !data) return null;
    return data as Child;
  },

  /** Fin de session enfant (retour à l'écran de connexion parent). */
  async end(): Promise<void> {
    await Preferences.remove({ key: CHILD_SESSION_KEY });
    await supabase.auth.signOut();
  },
};
