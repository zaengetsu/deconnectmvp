import { vi } from 'vitest';
import { sessionStore, type StoredSession } from '../lib/session';

/** Réponse JSON de test. */
export const json = (status: number, body: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export interface Call {
  method: string;
  path: string;
  body: unknown;
  auth: string | undefined;
  contentType: string | undefined;
}

type Handler = unknown | ((call: Call) => unknown | Response);

/**
 * Remplace fetch par un routeur : clé « MÉTHODE /chemin » (requête comprise, ou sans) → corps JSON
 * ou fonction. Les routes absentes répondent {}. Renvoie la liste des appels, dans l'ordre.
 */
export function mockApi(routes: Record<string, Handler> = {}) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    const path = String(url).replace(/^https?:\/\/[^/]+/, '');
    const raw = init.body;
    const call: Call = {
      method: init.method ?? 'GET',
      path,
      body: typeof raw === 'string' ? JSON.parse(raw) : raw,
      auth: headers.authorization,
      contentType: headers['content-type'],
    };
    calls.push(call);
    const handler = routes[`${call.method} ${path}`] ?? routes[`${call.method} ${path.split('?')[0]}`];
    const out = typeof handler === 'function' ? (handler as (c: Call) => unknown)(call) : handler;
    if (out instanceof Response) return out;
    return json(200, out ?? {});
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock, routes: calls.map((c) => `${c.method} ${c.path}`) as string[], list: () => calls.map((c) => `${c.method} ${c.path}`) };
}

export async function signedInAs(kind: 'parent' | 'child', subjectId = kind === 'parent' ? 'parent-1' : 'child-1', extra: Partial<StoredSession> = {}) {
  await sessionStore.set({ kind, subjectId, accessToken: `at-${subjectId}`, refreshToken: `rt-${subjectId}`, email: kind === 'parent' ? 'camille@test.fr' : null, ...extra });
}
