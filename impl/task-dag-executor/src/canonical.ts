// Canonical serialization and SHA-256, plus the closed expression evaluator.

import { createHash } from 'node:crypto';
import type { Expr } from './types.ts';

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

// Evaluate a closed guard expression over a flat binding map (resolved inputs or
// outputs). Deterministic and side-effect-free.
export function evaluate(expr: Expr, bindings: Readonly<Record<string, unknown>>): boolean {
  switch (expr.op) {
    case 'always':
      return true;
    case 'present':
      return expr.port in bindings && bindings[expr.port] !== undefined && bindings[expr.port] !== null;
    case 'non_empty': {
      const v = bindings[expr.port];
      if (typeof v === 'string') return v.length > 0;
      if (Array.isArray(v)) return v.length > 0;
      return v !== undefined && v !== null;
    }
    case 'equals':
      return bindings[expr.port] === expr.value;
    case 'all':
      return expr.args.every((a) => evaluate(a, bindings));
  }
}
