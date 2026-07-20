// P5 — approval-gate. The sole execution path: validate, resolve, evaluate, human
// approval, grant binding, ticket mint, dispatch, and logging. Every guarantee on
// this sheet holds at this one choke point, against a fully injected L2.

import { randomUUID } from 'node:crypto';
import type { AuditLog } from './audit.ts';
import type { ApprovalRequest, ApprovalSheet, ExecutionTicket, Perception, RenderSurface } from './boundary.ts';
import { mintTicket } from './boundary.ts';
import { digest } from './canonical.ts';
import { actionDigest, decision, finding, stateBinding, validateProposal } from './contract.ts';
import type { BudgetSnapshot } from './engine.ts';
import { evaluate } from './engine.ts';
import type { Policy, PolicyStore } from './policyStore.ts';
import { resolve } from './resolver.ts';
import type { ActResult, FillResult } from './boundary.ts';
import type { ActionProposal, Decision, ResolvedAction, Snapshot } from './types.ts';
import type { CapabilityVault } from './vault.ts';

interface ApprovalGrant {
  grant_id: string;
  binding: string;
  granted_at: number;
  ttl_s: number;
  consumed: boolean;
  operator_ref: string;
  policy_rev: number;
}

export type SubmitStatus =
  | 'schema_invalid' | 'resolve_failed' | 'blocked' | 'denied' | 'dispatched' | 'invalidated';

export interface SubmitResult {
  readonly decision: Decision;
  readonly executed: boolean;
  readonly status: SubmitStatus;
  readonly result?: ActResult | FillResult;
}

const TICKET_TTL_MS = 2000;

export class ApprovalGate {
  private readonly grants = new Map<string, ApprovalGrant>();
  private dispatchTimes: number[] = [];
  private originTimes = new Map<string, number[]>();

  constructor(
    private readonly policyStore: PolicyStore,
    private readonly vault: CapabilityVault,
    private readonly audit: AuditLog,
    private readonly perception: Perception,
    private readonly surface: RenderSurface,
    private readonly approvalSheet: ApprovalSheet,
    private readonly sessionKey: Buffer,
    private readonly now: () => Date,
  ) {}

  private ts(): string {
    return this.now().toISOString();
  }

  private windowCount(times: number[], nowMs: number): number {
    return times.filter((t) => nowMs - t < 60000).length;
  }

  private buildBudget(resolved: ResolvedAction, snap: Snapshot): BudgetSnapshot {
    const nowDate = this.now();
    const nowMs = nowDate.getTime();
    return {
      month_spent_minor: this.vault.monthSpent(resolved.workspace_id, nowDate),
      actions_last_min: this.windowCount(this.dispatchTimes, nowMs),
      origin_actions_last_min: this.windowCount(this.originTimes.get(resolved.origin) ?? [], nowMs),
      token: this.vault.tokenState(resolved.token_id, resolved.origin, resolved.tier_effective, nowDate),
      handle_workspace_id: snap.workspace_id,
    };
  }

  submit(raw: string | unknown): SubmitResult {
    const ts = this.ts();
    const rawId = extractId(raw);
    this.audit.append('proposal.received', { proposal_id: rawId, task_ref: extractTaskRef(raw) }, ts);

    const v = validateProposal(raw, ts);
    if (!v.ok) {
      this.audit.append('proposal.rejected', { proposal_id: rawId, code: 'SCHEMA_INVALID' }, ts);
      return { decision: v.decision, executed: false, status: 'schema_invalid' };
    }
    const p = v.proposal;

    const snap = this.perception.snapshot(p.handle_ref);
    if (snap === null) {
      this.audit.append('resolve.failed', { proposal_id: p.proposal_id, reason: 'no_snapshot' }, ts);
      return { decision: this.blockDecision('RESOLVE_FAILED', p, ts), executed: false, status: 'resolve_failed' };
    }
    const rr = resolve(p, snap);
    if (!rr.ok) {
      this.audit.append('resolve.failed', { proposal_id: p.proposal_id, reason: rr.reason }, ts);
      return { decision: this.blockDecision('RESOLVE_FAILED', p, ts), executed: false, status: 'resolve_failed' };
    }
    const resolved = rr.resolved;
    this.audit.append('action.resolved', {
      proposal_id: p.proposal_id, origin: resolved.origin, tier_effective: resolved.tier_effective,
      consequence_effective: resolved.consequence_effective, amount_minor: resolved.amount_minor, mismatches: resolved.mismatches,
    }, ts);

    const budget = this.buildBudget(resolved, snap);
    const dec = evaluate(this.policyStore.current(), resolved, budget, ts);
    this.audit.append('decision.rendered', {
      proposal_id: p.proposal_id, verdict: dec.verdict, codes: dec.findings.map((f) => f.code), policy_rev: dec.policy_rev,
    }, ts);

    if (dec.verdict === 'BLOCK') return { decision: dec, executed: false, status: 'blocked' };

    let grant: ApprovalGrant | null = null;
    if (dec.verdict === 'CONFIRM') {
      const policy = this.policyStore.current();
      if (policy === null) return { decision: dec, executed: false, status: 'blocked' };
      const req = this.buildRequest(p, resolved, dec, policy, snap);
      this.audit.append('approval.requested', { request_id: req.request_id, proposal_id: p.proposal_id, expires_at: req.expires_at }, ts);
      const resp = this.approvalSheet.request(req);
      const timedOut = resp.elapsed_s >= policy.approval_timeout_s;
      if (!resp.approved || timedOut) {
        this.audit.append('approval.denied', { request_id: req.request_id, reason: timedOut ? 'timeout' : 'denied' }, ts);
        return { decision: dec, executed: false, status: 'denied' };
      }
      grant = {
        grant_id: randomUUID(),
        binding: digest(stateBinding(resolved, policy.policy_rev)),
        granted_at: this.now().getTime(),
        ttl_s: policy.grant_ttl_s,
        consumed: false,
        operator_ref: resp.operator_ref,
        policy_rev: policy.policy_rev,
      };
      this.grants.set(grant.grant_id, grant);
      this.audit.append('approval.granted', { request_id: req.request_id, grant_id: grant.grant_id, binding: grant.binding, operator_ref: grant.operator_ref }, ts);
    }

    return this.dispatch(p, dec, grant);
  }

  private dispatch(p: ActionProposal, dec: Decision, grant: ApprovalGrant | null): SubmitResult {
    const ts = this.ts();
    if (dec.verdict === 'BLOCK') return { decision: dec, executed: false, status: 'blocked' };
    if (dec.verdict === 'CONFIRM' && grant === null) return { decision: dec, executed: false, status: 'denied' };

    // Re-resolve against a fresh snapshot immediately before dispatch.
    const fresh = this.perception.snapshot(p.handle_ref);
    const rr2 = fresh === null ? null : resolve(p, fresh);
    if (fresh === null || rr2 === null || !rr2.ok) {
      const gid = grant?.grant_id ?? 'none';
      this.audit.append('grant.invalidated', { grant_id: gid, reason: 'resolve_failed' }, ts);
      return { decision: dec, executed: false, status: 'invalidated' };
    }
    const resolved2 = rr2.resolved;
    const policy = this.policyStore.current();

    if (grant !== null) {
      const currentRev = policy?.policy_rev ?? -1;
      const rebind = policy === null ? '' : digest(stateBinding(resolved2, policy.policy_rev));
      const expired = this.now().getTime() > grant.granted_at + grant.ttl_s * 1000;
      let reason: string | null = null;
      if (grant.consumed) reason = 'CONSUMED';
      else if (grant.policy_rev !== currentRev) reason = 'POLICY_CHANGED';
      else if (expired) reason = 'EXPIRED';
      else if (rebind !== grant.binding) reason = 'STATE_CHANGED';
      if (reason !== null) {
        this.audit.append('grant.invalidated', { grant_id: grant.grant_id, reason }, ts);
        return { decision: dec, executed: false, status: 'invalidated' };
      }
    }

    // Durable pre-dispatch record BEFORE any act.
    const digestNow = actionDigest(resolved2);
    this.audit.append('action.dispatched', {
      proposal_id: p.proposal_id, grant_id: grant?.grant_id ?? null, action_digest: digestNow,
    }, ts, /* durable */ true);

    if (resolved2.consequence_effective === 'monetary' && resolved2.amount_minor !== null && resolved2.currency !== null) {
      this.vault.debit(resolved2.workspace_id, resolved2.origin, resolved2.amount_minor, resolved2.currency, grant?.grant_id ?? 'allow', ts);
      this.audit.append('budget.debit', { workspace_id: resolved2.workspace_id, amount_minor: resolved2.amount_minor, currency: resolved2.currency, grant_id: grant?.grant_id ?? 'allow' }, ts);
    }

    const ticket: ExecutionTicket = mintTicket(this.sessionKey, {
      ticket_id: randomUUID(),
      action_digest: digestNow,
      nav_epoch: resolved2.nav_epoch,
      expiry: new Date(this.now().getTime() + TICKET_TTL_MS).toISOString(),
      single_use: true,
    });

    let result: ActResult | FillResult;
    if (resolved2.kind === 'fill_secret' && resolved2.secret_ref !== null) {
      result = this.vault.fill(this.surface, resolved2.workspace_id, p.handle_ref, p.target_node, resolved2.secret_ref, resolved2.origin, ticket);
      this.audit.append('vault.fill', { secret_ref: resolved2.secret_ref, origin: resolved2.origin, node_id: p.target_node, ok: result.ok }, ts);
    } else {
      result = this.surface.act(p.handle_ref, { kind: resolved2.kind, node_id: p.target_node }, ticket);
    }

    if (grant !== null) grant.consumed = true;
    // Record this dispatch for the rate window.
    const nowMs = this.now().getTime();
    this.dispatchTimes.push(nowMs);
    const ot = this.originTimes.get(resolved2.origin) ?? [];
    ot.push(nowMs);
    this.originTimes.set(resolved2.origin, ot);

    this.audit.append('action.result', { proposal_id: p.proposal_id, ok: result.ok }, ts);
    return { decision: dec, executed: result.ok, status: 'dispatched', result };
  }

  private blockDecision(code: string, p: ActionProposal, ts: string): Decision {
    return decision('BLOCK', [finding('BLOCK', code, code)], p.proposal_id, this.policyStore.current()?.policy_rev ?? null, ts);
  }

  private buildRequest(p: ActionProposal, resolved: ResolvedAction, dec: Decision, policy: Policy, snap: Snapshot): ApprovalRequest {
    const node = snap.nodes.find((n) => n.node_id === p.target_node);
    return {
      request_id: randomUUID(),
      workspace_id: resolved.workspace_id,
      origin: resolved.origin,
      kind: resolved.kind,
      consequence_effective: resolved.consequence_effective,
      tier_effective: resolved.tier_effective,
      amount_minor: resolved.amount_minor,
      currency: resolved.currency,
      finding_codes: dec.findings.map((f) => f.code),
      expires_at: new Date(this.now().getTime() + policy.approval_timeout_s * 1000).toISOString(),
      page_content: { target_name: node?.name ?? '' },
    };
  }
}

function extractId(raw: unknown): string | null {
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const o = raw as { proposal_id?: unknown };
  return typeof o?.proposal_id === 'string' ? o.proposal_id : null;
}
function extractTaskRef(raw: unknown): string | null {
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const o = raw as { task_ref?: unknown };
  return typeof o?.task_ref === 'string' ? o.task_ref : null;
}
