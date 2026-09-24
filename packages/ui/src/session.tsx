'use client';
import { type AuthResult, authApi, HttpClient, LocalSessionStore, type Me } from '@rekonect/api-client';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type SessionStatus = 'loading' | 'authenticated' | 'anonymous';
export interface SessionValue {
  http: HttpClient;
  user: Me | null;
  status: SessionStatus;
  login(email: string, password: string): Promise<Me>;
  acceptInvitation(token: string, fullName: string, password: string): Promise<Me>;
  logout(): Promise<void>;
  auth: ReturnType<typeof authApi>;
}

const SessionContext = createContext<SessionValue | null>(null);

export class WrongPortalError extends Error {
  constructor(readonly role: string) {
    super(role === 'parent' ? 'Ce compte est un compte famille : utilisez l’application Rekonect.' : 'Ce compte n’a pas accès à cet espace.');
    this.name = 'WrongPortalError';
  }
}

/**
 * Session d'un portail web : jetons dans le stockage local (rafraîchis automatiquement),
 * profil chargé au démarrage, rôle vérifié (un compte partenaire n'ouvre pas le back-office).
 */
export function SessionProvider({ baseUrl, storageKey, roles, children, http: provided }: { baseUrl: string; storageKey: string; roles: Me['role'][]; children: ReactNode; http?: HttpClient }) {
  const [user, setUser] = useState<Me | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const http = useMemo(() => provided ?? new HttpClient({ baseUrl, store: new LocalSessionStore(storageKey) }), [provided, baseUrl, storageKey]);
  const auth = useMemo(() => authApi(http), [http]);

  const accept = useCallback(
    async (me: Me) => {
      if (!roles.includes(me.role)) {
        http.setSession(null);
        throw new WrongPortalError(me.role);
      }
      setUser(me);
      setStatus('authenticated');
      return me;
    },
    [http, roles],
  );

  useEffect(() => {
    let alive = true;
    if (!http.session) {
      setStatus('anonymous');
      return;
    }
    auth
      .me()
      .then(async (me) => {
        if (alive) await accept(me);
      })
      .catch(() => {
        if (!alive) return;
        http.setSession(null);
        setUser(null);
        setStatus('anonymous');
      });
    return () => {
      alive = false;
    };
  }, [http, auth, accept]);

  useEffect(
    () =>
      http.onSessionChange((s) => {
        if (!s) {
          setUser(null);
          setStatus('anonymous');
        }
      }),
    [http],
  );

  const value = useMemo<SessionValue>(
    () => ({
      http,
      user,
      status,
      auth,
      login: async (email, password) => accept(await auth.login(email, password)),
      acceptInvitation: async (token, fullName, password) => accept(await auth.acceptPartnerInvitation(token, fullName, password)),
      logout: async () => {
        await auth.logout().catch(() => undefined);
        setUser(null);
        setStatus('anonymous');
      },
    }),
    [http, user, status, auth, accept],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession doit être utilisé dans <SessionProvider>');
  return v;
}

export type { AuthResult };

/** Enregistre un fichier téléchargé (CSV). */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Lit un fichier choisi par l'utilisateur en data URL (téléversement d'image). */
export function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('Lecture impossible'));
    r.readAsDataURL(file);
  });
}

export function readAsText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('Lecture impossible'));
    r.readAsText(file);
  });
}
