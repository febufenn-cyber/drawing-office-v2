// P3 — policy-store. The single source of authorization truth, read only by
// deterministic code. Validates on load (fail-closed), serves the live policy,
// increments policy_rev on every accepted reload.

import { TIERS } from './types.ts';
import type { Tier } from './types.ts';

export interface OriginGrant {
  readonly origin: string;
  readonly tier: Tier;
}
export interface Caps {
  readonly currency: string;
  readonly per_action_minor: number;
  readonly per_workspace_month_minor: number;
}
export interface RateLimits {
  readonly actions_per_min: number;
  readonly per_origin_per_min: number;
}
export interface Policy {
  readonly policy_rev: number;
  readonly workspace_id: string;
  readonly origin_grants: readonly OriginGrant[];
  readonly forbidden_origins: readonly string[];
  readonly caps: Caps | null;
  readonly rate: RateLimits;
  readonly destructive_bulk_limit: number;
  readonly grant_ttl_s: number;
  readonly approval_timeout_s: number;
}

export interface PolicyDraft {
  readonly workspace_id: string;
  readonly origin_grants?: readonly OriginGrant[];
  readonly forbidden_origins?: readonly string[];
  readonly caps?: Caps | null;
  readonly rate?: Partial<RateLimits>;
  readonly destructive_bulk_limit?: number;
  readonly grant_ttl_s?: number;
  readonly approval_timeout_s?: number;
}

const ISO_4217 = new Set(['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'SGD']);

export type LoadResult = { readonly ok: true; readonly policy: Policy } | { readonly ok: false; readonly reason: string };

const KNOWN_KEYS = new Set(['workspace_id', 'origin_grants', 'forbidden_origins', 'caps', 'rate', 'destructive_bulk_limit', 'grant_ttl_s', 'approval_timeout_s']);

export class PolicyStore {
  private policy: Policy | null = null;

  load(draft: PolicyDraft): LoadResult {
    for (const k of Object.keys(draft)) if (!KNOWN_KEYS.has(k)) return { ok: false, reason: 'unknown_key:' + k };
    if (typeof draft.workspace_id !== 'string' || draft.workspace_id.length === 0) return { ok: false, reason: 'empty_workspace_id' };

    const grants = draft.origin_grants ?? [];
    for (const g of grants) {
      if (!TIERS.has(g.tier)) return { ok: false, reason: 'bad_tier:' + g.origin };
      if (g.tier === 'transact' && (draft.caps ?? null) === null) return { ok: false, reason: 'transact_without_caps' };
    }
    const caps = draft.caps ?? null;
    if (caps !== null) {
      if (!ISO_4217.has(caps.currency)) return { ok: false, reason: 'bad_currency' };
      if (!Number.isInteger(caps.per_action_minor) || caps.per_action_minor <= 0) return { ok: false, reason: 'bad_per_action' };
      if (!Number.isInteger(caps.per_workspace_month_minor) || caps.per_workspace_month_minor <= 0) return { ok: false, reason: 'bad_month_cap' };
    }
    const rate: RateLimits = {
      actions_per_min: draft.rate?.actions_per_min ?? 30,
      per_origin_per_min: draft.rate?.per_origin_per_min ?? 10,
    };
    if (rate.actions_per_min <= 0 || rate.per_origin_per_min <= 0) return { ok: false, reason: 'bad_rate' };
    const bulk = draft.destructive_bulk_limit ?? 25;
    const ttl = draft.grant_ttl_s ?? 120;
    const timeout = draft.approval_timeout_s ?? 600;
    if (bulk <= 0 || ttl <= 0 || timeout <= 0) return { ok: false, reason: 'non_positive_limit' };

    const nextRev = (this.policy?.policy_rev ?? 0) + 1;
    const policy: Policy = {
      policy_rev: nextRev,
      workspace_id: draft.workspace_id,
      origin_grants: grants,
      forbidden_origins: draft.forbidden_origins ?? [],
      caps,
      rate,
      destructive_bulk_limit: bulk,
      grant_ttl_s: ttl,
      approval_timeout_s: timeout,
    };
    this.policy = policy;
    return { ok: true, policy };
  }

  current(): Policy | null {
    return this.policy;
  }

  grantedTier(origin: string): Tier {
    if (this.policy === null) return 'read';
    let best: Tier = 'read';
    for (const g of this.policy.origin_grants) {
      if (g.origin === origin && TIER_ORDER_GTE(g.tier, best)) best = g.tier;
    }
    return best;
  }

  isForbidden(origin: string): boolean {
    return this.policy?.forbidden_origins.includes(origin) ?? false;
  }
}

function TIER_ORDER_GTE(a: Tier, b: Tier): boolean {
  const order: Record<Tier, number> = { read: 0, interact: 1, transact: 2 };
  return order[a] >= order[b];
}
