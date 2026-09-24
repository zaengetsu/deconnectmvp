import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { capacitorStorage } from './capacitor-storage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.'
  );
}

const authStorage = Capacitor.isNativePlatform() ? capacitorStorage : localStorage;

// ── Resilient fetch wrapper ──────────────────────────────────────────
// iOS WKWebView limite à 6 connexions HTTP simultanées par host.
// Le freeze apparaît quand des requêtes bloquent indéfiniment ces slots.
// Solution : hard timeout 10s — libère chaque slot bloqué automatiquement.
//
// Note: on a retiré le sémaphore de concurrence qui causait un deadlock
// quand les pages enfant tentaient de fetcher pendant qu'une file de
// requêtes parent occupait tous les slots.
const FETCH_TIMEOUT_MS = 10_000; // 10s — libération rapide des slots

// Prevent 401-retry storm
let _401RetryInFlight = false;

const resilientFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : (input as Request).url;
  const shortUrl = url.replace(supabaseUrl, '').split('?')[0];
  const isAuthEndpoint = shortUrl.includes('/auth/v1/');

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    console.error('[Supabase TIMEOUT]', shortUrl);
    controller.abort();
  }, FETCH_TIMEOUT_MS);

  if (init?.signal) {
    init.signal.addEventListener('abort', () => controller.abort());
  }

  try {
    const response = await fetch(input, { ...init, signal: controller.signal });

    // ── 401: JWT expiré → attendre auto-refresh puis retry ──────────
    if (response.status === 401 && !isAuthEndpoint && !_401RetryInFlight) {
      console.warn('[Supabase] 401', shortUrl, '— waiting for token refresh...');
      _401RetryInFlight = true;
      await new Promise(res => setTimeout(res, 2500));
      _401RetryInFlight = false;

      const rc = new AbortController();
      const rt = setTimeout(() => rc.abort(), FETCH_TIMEOUT_MS);
      try {
        const retryResp = await fetch(input, { ...init, signal: rc.signal });
        clearTimeout(rt);
        console.info('[Supabase 401→OK]', retryResp.status, shortUrl);
        return retryResp;
      } catch {
        clearTimeout(rt);
        return response;
      }
    }

    if (!response.ok && response.status !== 401) {
      console.warn('[Supabase←]', response.status, shortUrl);
    }
    return response;

  } catch (err) {
    const errMsg = (err as Error).message || '';
    const isAbort = (err as Error).name === 'AbortError';

    if (isAbort) {
      console.error('[Supabase TIMEOUT]', shortUrl, '— slot freed after 10s');
    } else {
      console.error('[Supabase ERROR]', shortUrl, errMsg);
    }

    // ── "Load failed" iOS = coupure réseau courte → retry 1.5s ─────
    const isNetworkDrop = !isAbort && (
      errMsg.includes('Load failed') ||
      errMsg.includes('Failed to fetch') ||
      errMsg.includes('NetworkError')
    );

    if (isNetworkDrop) {
      console.warn('[Supabase] Network drop — retrying 1.5s...', shortUrl);
      await new Promise(res => setTimeout(res, 1500));
      try {
        const rc = new AbortController();
        const rt = setTimeout(() => rc.abort(), FETCH_TIMEOUT_MS);
        const retryResp = await fetch(input, { ...init, signal: rc.signal });
        clearTimeout(rt);
        console.info('[Supabase RETRY OK]', retryResp.status, shortUrl);
        return retryResp;
      } catch (retryErr) {
        console.error('[Supabase RETRY FAILED]', shortUrl);
        throw retryErr;
      }
    }

    throw err;
  } finally {
    clearTimeout(timeout);
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    storage: authStorage,
  },
  global: {
    fetch: resilientFetch,
  },
});
