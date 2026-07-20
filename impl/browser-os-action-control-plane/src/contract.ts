// P1 — action-proposal-contract. Validates raw proposals into typed
// ActionProposals; rejection is itself a Decision with SCHEMA_INVALID. Also owns
// the action digest and the StateBinding an ApprovalGrant binds to.

import { canonical, digest } from './canonical.ts';
import { ACTION_KINDS, CONSEQUENCES, TIERS } from './types.ts';
import type { ActionProposal, Decision, Finding, ResolvedAction, Verdict } from './types.ts';

export function finding(severity: Verdict, code: string, detail: string): Finding {
  return { severity, code, detail };
}

export function decision(
  verdict: Verdict,
  findings: readonly Finding[],
  proposal_ref: string | null,
  policy_rev: number | null,
  decided_at: string,
): Decision {
  return { verdict, findings, proposal_ref, policy_rev, decided_at };
}

const REQUIRED = ['proposal_id', 'workspace_id', 'handle_ref', 'kind', 'target_node', 'snapshot_ref', 'declared', 'token_id', 'secret_ref', 'task_ref'];
const DECLARED_REQUIRED = ['intent_text', 'origin', 'tier', 'consequence', 'amount_minor', 'currency'];

export type ValidateResult = { readonly ok: true; readonly proposal: ActionProposal } | { readonly ok: false; readonly decision: Decision };

// Parses and schema-checks. rawOrBytes may be a string (JSON) or a parsed object.
export function validateProposal(rawOrBytes: string | unknown, now: string): ValidateResult {
  let obj: unknown = rawOrBytes;
  if (typeof rawOrBytes === 'string') {
    try {
      obj = JSON.parse(rawOrBytes);
    } catch {
      return { ok: false, decision: decision('BLOCK', [finding('BLOCK', 'SCHEMA_INVALID', 'not JSON')], null, null, now) };
    }
  }
  const parsedId = typeof obj === 'object' && obj !== null && typeof (obj as { proposal_id?: unknown }).proposal_id === 'string'
    ? (obj as { proposal_id: string }).proposal_id : null;
  const bad = (): ValidateResult => ({ ok: false, decision: decision('BLOCK', [finding('BLOCK', 'SCHEMA_INVALID', 'schema')], parsedId, null, now) });

  if (typeof obj !== 'object' || obj === null) return bad();
  const o = obj as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!REQUIRED.includes(k)) return bad();
  for (const k of REQUIRED) if (!(k in o)) return bad();
  if (typeof o.proposal_id !== 'string' || o.proposal_id.length === 0) return bad();
  if (typeof o.workspace_id !== 'string' || o.workspace_id.length === 0) return bad();
  if (typeof o.handle_ref !== 'string' || o.handle_ref.length === 0) return bad();
  if (typeof o.kind !== 'string' || !ACTION_KINDS.has(o.kind as ActionProposal['kind'])) return bad();
  if (typeof o.target_node !== 'string' || o.target_node.length === 0) return bad();
  if (!(o.token_id === null || typeof o.token_id === 'string')) return bad();
  if (!(o.secret_ref === null || typeof o.secret_ref === 'string')) return bad();
  if (typeof o.task_ref !== 'string') return bad();

  const sr = o.snapshot_ref;
  if (typeof sr !== 'object' || sr === null) return bad();
  const s = sr as Record<string, unknown>;
  if (typeof s.snapshot_id !== 'string' || !Number.isInteger(s.nav_epoch)) return bad();

  const dcl = o.declared;
  if (typeof dcl !== 'object' || dcl === null) return bad();
  const d = dcl as Record<string, unknown>;
  for (const k of Object.keys(d)) if (!DECLARED_REQUIRED.includes(k)) return bad();
  for (const k of DECLARED_REQUIRED) if (!(k in d)) return bad();
  if (typeof d.intent_text !== 'string') return bad();
  if (typeof d.origin !== 'string') return bad();
  if (typeof d.tier !== 'string' || !TIERS.has(d.tier as ActionProposal['declared']['tier'])) return bad();
  if (typeof d.consequence !== 'string' || !CONSEQUENCES.has(d.consequence as ActionProposal['declared']['consequence'])) return bad();
  if (!(d.amount_minor === null || (Number.isInteger(d.amount_minor) && (d.amount_minor as number) >= 0))) return bad();
  if (!(d.currency === null || typeof d.currency === 'string')) return bad();

  return { ok: true, proposal: obj as ActionProposal };
}

// The action digest binds a ticket and a grant to a specific resolved action,
// excluding the advisory mismatches list.
export function actionDigest(r: ResolvedAction): string {
  return digest({
    workspace_id: r.workspace_id,
    origin: r.origin,
    nav_epoch: r.nav_epoch,
    target_digest: r.target_digest,
    form_digest: r.form_digest,
    method: r.method,
    endpoint: r.endpoint,
    payload_classes: r.payload_classes,
    amount_minor: r.amount_minor,
    currency: r.currency,
    entity_count: r.entity_count,
    kind: r.kind,
  });
}

// The StateBinding an approval is granted against: the human approved that amount,
// on that page, in that state, and nothing else.
export function stateBinding(r: ResolvedAction, policy_rev: number): string {
  return canonical({
    workspace_id: r.workspace_id,
    origin: r.origin,
    nav_epoch: r.nav_epoch,
    target_digest: r.target_digest,
    form_digest: r.form_digest,
    action_digest: actionDigest(r),
    amount_minor: r.amount_minor,
    currency: r.currency,
    policy_rev,
    token_id: r.token_id,
  });
}
