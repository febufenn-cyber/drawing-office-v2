// Stdlib crypto: AES-256-GCM for BYO keys at rest, HMAC for the per-session
// producer-tag mac, canonical serialization for both.

import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function canonical(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite');
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
  }
  throw new Error('uncanonicalizable');
}

export function hmacHex(key: Buffer, s: string): string {
  return createHmac('sha256', key).update(s, 'utf8').digest('hex');
}

export function hexEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

export interface Sealed {
  readonly iv: string;
  readonly ct: string;
  readonly tag: string;
}

export function seal(key: Buffer, plaintext: Buffer): Sealed {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plaintext), c.final()]);
  return { iv: iv.toString('hex'), ct: ct.toString('hex'), tag: c.getAuthTag().toString('hex') };
}

export function open(key: Buffer, s: Sealed): Buffer | null {
  try {
    const d = createDecipheriv('aes-256-gcm', key, Buffer.from(s.iv, 'hex'));
    d.setAuthTag(Buffer.from(s.tag, 'hex'));
    return Buffer.concat([d.update(Buffer.from(s.ct, 'hex')), d.final()]);
  } catch {
    return null;
  }
}
