// Canonical serialization, hashing, and the two digests the boundary binds to:
// the per-node stable digest (node identity across DOM drift) and the action
// digest (what an ExecutionTicket authorizes). Both use SHA-256; MACs use
// HMAC-SHA256. Stdlib crypto only.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Action } from './types.ts';

// Deterministic JSON: sorted keys, no whitespace. Equal values serialize
// byte-identically regardless of key order, so digests are stable.
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
  throw new Error('cannot canonicalize value of type ' + typeof value);
}

export function sha256hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

export function hmacHex(key: Buffer, s: string): string {
  return createHmac('sha256', key).update(s, 'utf8').digest('hex');
}

// Constant-time hex comparison for MAC checks.
export function hexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// The stable facts a node's identity is computed from. Deliberately excludes
// volatile attributes (positions, ad ids, timestamps) so the digest survives
// minor DOM drift while changing when the node meaningfully changes.
export interface StableNodeFacts {
  readonly tag: string;
  readonly role: string;
  readonly name: string;
  readonly testid: string;
  readonly aria: string;
  readonly path: string; // structural position, e.g. "body/form[1]/input[2]"
}

export function nodeDigest(facts: StableNodeFacts): string {
  return sha256hex(
    canonical({
      tag: facts.tag,
      role: facts.role,
      name: facts.name,
      testid: facts.testid,
      aria: facts.aria,
      path: facts.path,
    }),
  );
}

export function actionDigest(a: Action): string {
  return sha256hex(canonical({ kind: a.kind, node_id: a.node_id, value: a.value ?? null }));
}
