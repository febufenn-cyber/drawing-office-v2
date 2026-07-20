// P1 — routing-policy. The single source of routing truth, read only by
// deterministic code. Validates on load (fail-closed), serves the live policy,
// and performs priority-ordered selection over class pools.

import { MODEL_CLASSES, reject } from './types.ts';
import type { Axis, ModelBinding, ModelClass, Policy, Rejection, Role } from './types.ts';

const ISO_4217 = new Set([
  'USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'SGD',
]);
const AXES = new Set<Axis>(['model', 'family', 'provider']);

// The fixed classes verify may resolve to; role_class must not map verify.
function validatePolicy(p: Policy): Policy | Rejection {
  if (typeof p.workspace_id !== 'string' || p.workspace_id.length === 0) return reject('empty_workspace_id');
  if (!AXES.has(p.independence_axis)) return reject('bad_axis');
  if (!Number.isInteger(p.provider_timeout_ms) || p.provider_timeout_ms <= 0) return reject('bad_timeout');

  // Every class named by role_class must have a non-empty pool.
  for (const role of Object.keys(p.role_class) as Role[]) {
    const cls = p.role_class[role];
    if (cls === undefined || !MODEL_CLASSES.has(cls)) return reject('bad_role_class:' + role);
    const pool = p.pools[cls];
    if (pool === undefined || pool.length === 0) return reject('empty_pool:' + cls);
  }
  // Every pooled binding must have an endpoint and a valid price.
  for (const cls of MODEL_CLASSES) {
    for (const b of p.pools[cls] ?? []) {
      if (typeof b.endpoint !== 'string' || b.endpoint.length === 0) return reject('no_endpoint:' + b.model_id);
      const price = p.prices[b.model_id];
      if (price === undefined) return reject('no_price:' + b.model_id);
      if (!Number.isInteger(price.input_minor_per_ktok) || price.input_minor_per_ktok <= 0) return reject('bad_price_in:' + b.model_id);
      if (!Number.isInteger(price.output_minor_per_ktok) || price.output_minor_per_ktok <= 0) return reject('bad_price_out:' + b.model_id);
      if (!ISO_4217.has(price.currency)) return reject('bad_currency:' + b.model_id);
    }
  }
  return p;
}

export class RoutingPolicy {
  private policy: Policy | null = null;

  // Loads a validated policy; on acceptance bumps policy_rev and serves it; on
  // refusal keeps the prior policy. Returns the accepted policy or a Rejection.
  load(candidate: Policy): Policy | Rejection {
    const v = validatePolicy(candidate);
    if ('rejected' in v) return v;
    const prevRev = this.policy?.policy_rev ?? 0;
    const accepted: Policy = { ...v, policy_rev: prevRev + 1 };
    this.policy = accepted;
    return accepted;
  }

  current(): Policy | null {
    return this.policy;
  }

  // Priority-ordered: returns the first pool binding outside the exclusion set
  // and priced, else null.
  select(class_req: ModelClass, exclusion: ReadonlySet<string>): ModelBinding | null {
    if (this.policy === null) return null;
    const pool = this.policy.pools[class_req] ?? [];
    for (const candidate of pool) {
      if (exclusion.has(candidate.model_id)) continue;
      if (this.policy.prices[candidate.model_id] === undefined) continue;
      return candidate;
    }
    return null;
  }
}
