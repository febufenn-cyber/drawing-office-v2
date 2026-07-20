// Canonical serialization and SHA-256, plus schema validation.

import { createHash } from 'node:crypto';
import type { Schema } from './types.ts';

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

function typeOk(v: unknown, t: 'string' | 'number' | 'boolean'): boolean {
  if (t === 'string') return typeof v === 'string';
  if (t === 'number') return typeof v === 'number';
  return typeof v === 'boolean';
}

function recordOk(rec: unknown, fields: Readonly<Record<string, 'string' | 'number' | 'boolean'>>): boolean {
  if (typeof rec !== 'object' || rec === null) return false;
  const o = rec as Record<string, unknown>;
  for (const [k, t] of Object.entries(fields)) if (!(k in o) || !typeOk(o[k], t)) return false;
  return true;
}

// Validates a value against a Schema (record, or list of records).
export function validateSchema(value: unknown, schema: Schema): boolean {
  if (schema.kind === 'list') {
    if (!Array.isArray(value)) return false;
    return value.every((rec) => recordOk(rec, schema.fields));
  }
  return recordOk(value, schema.fields);
}

// Validates a flat param set against a record schema of string fields.
export function validateParams(params: Readonly<Record<string, string>>, schema: Schema): boolean {
  for (const k of Object.keys(schema.fields)) if (typeof params[k] !== 'string') return false;
  return true;
}
