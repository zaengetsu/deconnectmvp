import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import * as argon2 from 'argon2';
import * as bcrypt from 'bcryptjs';

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function randomHex(bytes: number): string {
  return randomBytes(bytes).toString('hex');
}

/** Alphabet sans caractères ambigus (0/O, 1/I/L), identique à la migration 030. */
const SHORT_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function shortCode(length = 6): string {
  let code = '';
  for (let i = 0; i < length; i++) code += SHORT_CODE_ALPHABET[randomInt(SHORT_CODE_ALPHABET.length)];
  return code;
}

/** Normalise une saisie de code court : casse, espaces et tirets ignorés. */
export function normalizeShortCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

// ─── Mots de passe et PIN ────────────────────────────────────────────────────
// Nouveaux secrets : argon2id. Secrets importés de Supabase : bcrypt ($2a/$2b), acceptés
// puis re-hachés en argon2 à la connexion suivante.

export function hashSecret(secret: string): Promise<string> {
  return argon2.hash(secret, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
}

export function isLegacyHash(hash: string): boolean {
  return /^\$2[aby]\$/.test(hash);
}

export async function verifySecret(hash: string | null | undefined, secret: string): Promise<boolean> {
  if (!hash) return false;
  try {
    if (isLegacyHash(hash)) return await bcrypt.compare(secret, hash);
    return await argon2.verify(hash, secret);
  } catch {
    return false;
  }
}
