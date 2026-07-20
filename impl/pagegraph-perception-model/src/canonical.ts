// Deterministic serialization and hashing. Equal values serialize byte-identically
// regardless of key order, so digests and ids are stable.

import { createHash } from 'node:crypto';

export function canonical(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('cannot canonicalize non-finite number');
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(obj[k])).join(',') + '}';
  }
  if (value === undefined) return 'null';
  throw new Error('cannot canonicalize value of type ' + typeof value);
}

export function sha256hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}
