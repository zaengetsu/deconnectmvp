import { supabase } from './supabase';

/**
 * Appels à l'API Rekonect (NestJS). Pendant la migration, l'app garde sa session Supabase :
 * l'API accepte ce jeton (pont Supabase, voir docs/architecture.md).
 */
export const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: { accept: 'application/json', ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Connexion impossible. Vérifiez votre réseau.');
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
    throw new ApiError(res.status, err.code ?? `HTTP_${res.status}`, err.message ?? 'Une erreur est survenue.');
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
