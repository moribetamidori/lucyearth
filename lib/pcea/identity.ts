import { createHash, randomInt } from 'node:crypto';

// Crockford base32: no I, L, O, U, so codes are easy to read aloud and retype.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_CHARS = 15; // 75 bits

export const COOKIE_NAME = 'pcea_uid';
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

/** A recovery code such as PCEA-7K3MQ-X9PA2-B4DFR. It is also the session cookie value. */
export function newRecoveryCode() {
  let raw = '';
  for (let i = 0; i < CODE_CHARS; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
  return formatCode(raw);
}

function formatCode(raw: string) {
  return `PCEA-${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}`;
}

/** Accepts sloppy input (lowercase, missing dashes, O for 0, I/L for 1). Returns the canonical code or null. */
export function normalizeCode(input: unknown) {
  if (typeof input !== 'string') return null;
  let raw = input.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (raw.startsWith('PCEA') && raw.length === CODE_CHARS + 4) raw = raw.slice(4);
  raw = raw.replace(/O/g, '0').replace(/[IL]/g, '1');
  if (raw.length !== CODE_CHARS || [...raw].some(c => !ALPHABET.includes(c))) return null;
  return formatCode(raw);
}

export const hashCode = (code: string) => createHash('sha256').update(`pcea:${code}`).digest('hex');

export function hashIp(ip: string | null) {
  if (!ip) return null;
  const salt = process.env.PCEA_IP_SALT ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'pcea';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

export function clientIp(headers: Headers) {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || null;
}

export const guestName = (userNumber: number, displayName: string | null) => displayName?.trim() || `Guest #${userNumber}`;
