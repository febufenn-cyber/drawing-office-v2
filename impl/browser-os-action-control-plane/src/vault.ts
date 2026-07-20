// P6 — capability-vault. Holds credentials (encrypted at rest under a per-workspace
// key), capability tokens, and the append-only spend ledger. Fills secrets into
// pages without ever exposing the value above L0. mint/check tokens feed the
// engine's TokenState; debit/month_spent feed its BudgetSnapshot.

import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import type { ExecutionTicket, FillResult, RenderSurface } from './boundary.ts';
import { TIER_ORDER } from './types.ts';
import type { FieldClass, Tier } from './types.ts';
import type { TokenState } from './engine.ts';

export interface WorkspaceKeySource {
  keyFor(workspace_id: string): Buffer | null;
}

export interface CapabilityToken {
  readonly token_id: string;
  readonly workspace_id: string;
  readonly scope: string; // origin
  readonly tier: Tier;
  readonly budget_minor: number | null;
  readonly expiry: string;
}

export interface LedgerEntry {
  readonly ts: string;
  readonly workspace_id: string;
  readonly origin: string;
  readonly amount_minor: number;
  readonly currency: string;
  readonly grant_id: string;
}

interface SealedSecret {
  readonly iv: string;
  readonly ct: string;
  readonly tag: string;
  readonly scope: string;
  readonly field_class: FieldClass;
}

export class CapabilityVault {
  private readonly secrets = new Map<string, Map<string, SealedSecret>>(); // ws -> ref -> sealed
  private readonly tokens = new Map<string, CapabilityToken>();
  private readonly ledger: LedgerEntry[] = [];

  constructor(private readonly wsKeys: WorkspaceKeySource) {}

  // ---- secrets ----
  putSecret(workspace_id: string, ref: string, value: Buffer, scope: string, field_class: FieldClass): boolean {
    const key = this.wsKeys.keyFor(workspace_id);
    if (key === null) return false;
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([c.update(value), c.final()]);
    let byRef = this.secrets.get(workspace_id);
    if (byRef === undefined) {
      byRef = new Map<string, SealedSecret>();
      this.secrets.set(workspace_id, byRef);
    }
    byRef.set(ref, { iv: iv.toString('hex'), ct: ct.toString('hex'), tag: c.getAuthTag().toString('hex'), scope, field_class });
    return true;
  }

  private resolveSecret(workspace_id: string, ref: string): { value: Buffer; scope: string } | null {
    const sealed = this.secrets.get(workspace_id)?.get(ref);
    const key = this.wsKeys.keyFor(workspace_id);
    if (sealed === undefined || key === null) return null;
    try {
      const d = createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'hex'));
      d.setAuthTag(Buffer.from(sealed.tag, 'hex'));
      const value = Buffer.concat([d.update(Buffer.from(sealed.ct, 'hex')), d.final()]);
      return { value, scope: sealed.scope };
    } catch {
      return null;
    }
  }

  secretScope(workspace_id: string, ref: string): string | null {
    return this.secrets.get(workspace_id)?.get(ref)?.scope ?? null;
  }

  // Streams the secret to RenderSurface.fillSecret. Returns only a boolean; the
  // value never appears in a return, log, or snapshot. Requires a valid ticket
  // (verified by the surface). Refuses an out-of-scope fill.
  fill(
    surface: RenderSurface,
    workspace_id: string,
    handle_ref: string,
    node_id: string,
    secret_ref: string,
    origin: string,
    ticket: ExecutionTicket,
  ): FillResult {
    const resolved = this.resolveSecret(workspace_id, secret_ref);
    if (resolved === null) return { ok: false };
    if (resolved.scope !== origin) {
      resolved.value.fill(0);
      return { ok: false }; // out-of-scope fill refused
    }
    const res = surface.fillSecret(handle_ref, node_id, resolved.value, ticket);
    resolved.value.fill(0);
    return { ok: res.ok };
  }

  // ---- tokens ----
  mint(workspace_id: string, scope: string, tier: Tier, budget_minor: number | null, expiry: string): CapabilityToken {
    const token: CapabilityToken = { token_id: randomUUID(), workspace_id, scope, tier, budget_minor, expiry };
    this.tokens.set(token.token_id, token);
    return token;
  }

  check(token_id: string, origin: string, tier: Tier, now: Date): boolean {
    const t = this.tokens.get(token_id);
    if (t === undefined) return false;
    if (Date.parse(t.expiry) <= now.getTime()) return false;
    if (t.scope !== origin) return false;
    return TIER_ORDER[t.tier] >= TIER_ORDER[tier];
  }

  tokenState(token_id: string | null, origin: string, tier_effective: Tier, now: Date): TokenState | null {
    if (token_id === null) return null;
    const t = this.tokens.get(token_id);
    if (t === undefined) return null;
    return {
      token_id: t.token_id,
      tier: t.tier,
      in_scope: t.scope === origin,
      live: Date.parse(t.expiry) > now.getTime(),
      budget_minor: t.budget_minor,
    };
  }

  // ---- ledger ----
  debit(workspace_id: string, origin: string, amount_minor: number, currency: string, grant_id: string, ts: string): LedgerEntry {
    const entry: LedgerEntry = { ts, workspace_id, origin, amount_minor, currency, grant_id };
    this.ledger.push(entry);
    return entry;
  }

  monthSpent(workspace_id: string, now: Date): number {
    let sum = 0;
    for (const e of this.ledger) {
      if (e.workspace_id !== workspace_id) continue;
      const t = new Date(e.ts);
      if (t.getUTCFullYear() === now.getUTCFullYear() && t.getUTCMonth() === now.getUTCMonth()) sum += e.amount_minor;
    }
    return sum;
  }
}
