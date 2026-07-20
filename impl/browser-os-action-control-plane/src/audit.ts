// P7 — audit-log. PORTED from rampart/audit.py: append-only, per-entry SHA-256
// hash chain from GENESIS, HMAC-SHA256 signature over the entry hash, caller
// timestamps, verify() that names the exact broken line. One chain and key per
// workspace. append gains a durable flush the gate uses before dispatch.

import { canonical, hmacHex, sha256hex } from './canonical.ts';

export const GENESIS_PREV = '0'.repeat(64);

// The closed event taxonomy.
export const EVENT_TAXONOMY = new Set([
  'policy.loaded', 'policy.rejected', 'proposal.received', 'proposal.rejected',
  'action.resolved', 'resolve.failed', 'decision.rendered', 'approval.requested',
  'approval.granted', 'approval.denied', 'grant.invalidated', 'action.dispatched',
  'action.result', 'vault.fill', 'budget.debit', 'budget.credit',
]);

export interface AuditEntry {
  readonly seq: number;
  readonly ts: string;
  readonly event: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly prev_hash: string;
  readonly entry_hash: string;
  readonly sig: string;
}

export interface VerifyReport {
  readonly ok: boolean;
  readonly problems: readonly string[];
}

export class AuditLog {
  private readonly entries: AuditEntry[] = [];
  private head = GENESIS_PREV;
  private durableCount = 0; // entries flushed to "stable storage"

  constructor(private readonly key: Buffer) {}

  private sign(entry_hash: string): string {
    return hmacHex(this.key, entry_hash);
  }

  append(event: string, data: Record<string, unknown>, ts: string, durable = false): AuditEntry {
    const seq = this.entries.length;
    const prev_hash = this.head;
    const body = canonical({ seq, ts, event, data, prev_hash });
    const entry_hash = sha256hex(body);
    const entry: AuditEntry = { seq, ts, event, data, prev_hash, entry_hash, sig: this.sign(entry_hash) };
    this.entries.push(entry);
    this.head = entry_hash;
    if (durable) this.durableCount = this.entries.length;
    return entry;
  }

  // The count of entries flushed durably. The gate asserts an act is preceded by
  // a durable action.dispatched record.
  durableThrough(): number {
    return this.durableCount;
  }

  headHash(): string {
    return this.head;
  }

  readAll(): readonly AuditEntry[] {
    return this.entries.slice();
  }

  // Serialize to JSONL, for a tamper test to mutate.
  toJsonl(): string {
    return this.entries.map((e) => canonical(e)).join('\n');
  }

  // Verify a JSONL chain against this key, naming the exact broken line.
  static verifyJsonl(key: Buffer, jsonl: string): VerifyReport {
    const problems: string[] = [];
    let prev = GENESIS_PREV;
    let expected = 0;
    const lines = jsonl.length === 0 ? [] : jsonl.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i] as string;
      if (raw.trim().length === 0) continue;
      let rec: AuditEntry;
      try {
        rec = JSON.parse(raw) as AuditEntry;
      } catch {
        problems.push('line ' + String(i + 1) + ': not valid JSON');
        return { ok: false, problems };
      }
      if (rec.seq !== expected) problems.push('line ' + String(i + 1) + ': seq ' + String(rec.seq) + ' != expected ' + String(expected));
      if (rec.prev_hash !== prev) problems.push('line ' + String(i + 1) + ': prev_hash breaks the chain');
      const body = canonical({ seq: rec.seq, ts: rec.ts, event: rec.event, data: rec.data, prev_hash: rec.prev_hash });
      const recomputed = sha256hex(body);
      if (recomputed !== rec.entry_hash) problems.push('line ' + String(i + 1) + ': entry_hash mismatch — record altered');
      if (hmacHex(key, rec.entry_hash) !== rec.sig) problems.push('line ' + String(i + 1) + ': signature invalid');
      prev = rec.entry_hash;
      expected += 1;
    }
    return { ok: problems.length === 0, problems };
  }

  verify(): VerifyReport {
    return AuditLog.verifyJsonl(this.key, this.toJsonl());
  }
}
