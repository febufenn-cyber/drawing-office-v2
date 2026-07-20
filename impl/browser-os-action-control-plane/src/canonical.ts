// Canonical serialization, SHA-256, and HMAC — the shared crypto primitives.
// Identical to the discipline in rampart/audit.py::canonical.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

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

export function sha256hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

export function digest(value: unknown): string {
  return sha256hex(canonical(value));
}

export function hmacHex(key: Buffer, s: string): string {
  return createHmac('sha256', key).update(s, 'utf8').digest('hex');
}

export function hexEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
