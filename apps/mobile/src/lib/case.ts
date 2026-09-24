/**
 * L'API renvoie du camelCase (Prisma) ; les écrans de l'app, portés depuis
 * Supabase, lisent des objets snake_case (types/database.types.ts). La
 * conversion se fait ici, une fois, dans la couche service : aucun écran n'a
 * besoin de changer.
 */
const toSnakeKey = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamelKey = (k: string) => k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && Object.getPrototypeOf(v) === Object.prototype;
}

function deep(value: unknown, key: (k: string) => string, skip: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) return value.map((v) => deep(v, key, skip));
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    // Certaines valeurs sont des dictionnaires libres (ex. notifications.data) : on ne touche pas à leurs clés.
    out[key(k)] = skip.has(k) ? v : deep(v, key, skip);
  }
  return out;
}

const FREE_FORM = new Set(['data', 'limits', 'payload', 'metadata']);

export function snake<T>(value: unknown): T {
  return deep(value, toSnakeKey, FREE_FORM) as T;
}

export function camel<T = Record<string, unknown>>(value: unknown): T {
  return deep(value, toCamelKey, FREE_FORM) as T;
}

/** Supprime les clés `undefined` (la validation zod de l'API refuse `null` là où elle attend un champ absent). */
export function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
