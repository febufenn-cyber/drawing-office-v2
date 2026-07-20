// P4 — policy-engine. Pure, deterministic, no mutable state. Runs the check set in
// table order, appends named Findings, and returns a Decision whose verdict is the
// maximum severity across findings. Fail-closed: ambiguity escalates, and an empty
// finding list is impossible.

import { decision, finding } from './contract.ts';
import { TIER_ORDER, VERDICT_ORDER } from './types.ts';
import type { Decision, Finding, ResolvedAction, Tier, Verdict } from './types.ts';
import type { Policy } from './policyStore.ts';

export interface TokenState {
  readonly token_id: string;
  readonly tier: Tier;
  readonly in_scope: boolean;
  readonly live: boolean;
  readonly budget_minor: number | null;
}
export interface BudgetSnapshot {
  readonly month_spent_minor: number;
  readonly actions_last_min: number;
  readonly origin_actions_last_min: number;
  readonly token: TokenState | null;
  readonly handle_workspace_id: string;
}

function maxVerdict(findings: readonly Finding[]): Verdict {
  let v: Verdict = 'ALLOW';
  for (const f of findings) if (VERDICT_ORDER[f.severity] > VERDICT_ORDER[v]) v = f.severity;
  return v;
}

export function evaluate(
  policy: Policy | null,
  resolved: ResolvedAction,
  budget: BudgetSnapshot,
  now: string,
): Decision {
  const findings: Finding[] = [];

  if (policy === null) {
    findings.push(finding('BLOCK', 'NO_POLICY', 'no valid policy loaded'));
    return decision('BLOCK', findings, resolved.proposal_ref, null, now);
  }

  const grantedTier = grantedTierFor(policy, resolved.origin);

  if (resolved.mismatches.length > 0) {
    findings.push(finding('CONFIRM', 'DECLARED_MISMATCH', 'declared disagrees with resolved: ' + resolved.mismatches.join(',')));
  }
  if (policy.forbidden_origins.includes(resolved.origin)) {
    findings.push(finding('BLOCK', 'ORIGIN_FORBIDDEN', resolved.origin));
  }
  if (TIER_ORDER[resolved.tier_effective] > TIER_ORDER[grantedTier]) {
    findings.push(finding('BLOCK', 'TIER_EXCEEDED', resolved.tier_effective + ' > granted ' + grantedTier));
  }
  if (TIER_ORDER[resolved.tier_effective] >= TIER_ORDER.interact) {
    const t = budget.token;
    if (t === null || !t.live || !t.in_scope || TIER_ORDER[t.tier] < TIER_ORDER[resolved.tier_effective]) {
      findings.push(finding('BLOCK', 'TOKEN_INVALID', 'no live in-scope token at the effective tier'));
    }
  }
  if (resolved.consequence_effective === 'irreversible') {
    findings.push(finding('CONFIRM', 'IRREVERSIBLE', 'irreversible action'));
  }
  if (resolved.consequence_effective === 'monetary') {
    findings.push(finding('CONFIRM', 'MONETARY', 'monetary action'));
    if (resolved.amount_minor === null || resolved.currency === null) {
      findings.push(finding('BLOCK', 'AMOUNT_UNRESOLVED', 'monetary action with unresolved amount or currency'));
    } else {
      const caps = policy.caps;
      const overAction = caps === null || resolved.amount_minor > caps.per_action_minor;
      const overMonth = caps === null || budget.month_spent_minor + resolved.amount_minor > caps.per_workspace_month_minor;
      const wrongCurrency = caps === null || resolved.currency !== caps.currency;
      const overToken = budget.token?.budget_minor != null && resolved.amount_minor > budget.token.budget_minor;
      if (overAction || overMonth || wrongCurrency || overToken) {
        findings.push(finding('BLOCK', 'CAP_EXCEEDED', 'amount exceeds a cap, token budget, or currency mismatch'));
      }
    }
  }
  for (const p of resolved.payload_classes) {
    if (p.field_class === 'credential_ref' && p.secret_scope !== resolved.origin) {
      findings.push(finding('BLOCK', 'EXFIL_PATTERN', 'credential_ref bound to ' + String(p.secret_scope) + ' sent to ' + resolved.origin));
      break;
    }
  }
  if (resolved.destructive && resolved.entity_count > policy.destructive_bulk_limit) {
    findings.push(finding('BLOCK', 'DESTRUCTIVE_BULK', String(resolved.entity_count) + ' > ' + String(policy.destructive_bulk_limit)));
  }
  if (budget.actions_last_min >= policy.rate.actions_per_min || budget.origin_actions_last_min >= policy.rate.per_origin_per_min) {
    findings.push(finding('BLOCK', 'RATE_EXCEEDED', 'rate limit reached'));
  }
  if (budget.handle_workspace_id !== resolved.workspace_id) {
    findings.push(finding('BLOCK', 'CROSS_WORKSPACE', 'handle workspace differs from proposal workspace'));
  }

  if (findings.length === 0) findings.push(finding('ALLOW', 'OK', 'all checks passed'));
  return decision(maxVerdict(findings), findings, resolved.proposal_ref, policy.policy_rev, now);
}

function grantedTierFor(policy: Policy, origin: string): Tier {
  let best: Tier = 'read';
  for (const g of policy.origin_grants) if (g.origin === origin && TIER_ORDER[g.tier] > TIER_ORDER[best]) best = g.tier;
  return best;
}
