// P2 — action-resolver. Judges the actual effect, never the declaration. Binds the
// target node in the current PageGraph snapshot and derives origin, method,
// endpoint, payload classes, amount, entity count, effective tier and consequence,
// and declared-versus-resolved mismatches. Deterministic.

import { maxConsequence, maxTier } from './types.ts';
import type { ActionProposal, Consequence, PayloadField, ResolvedAction, Snapshot, Tier } from './types.ts';

const IRREVERSIBLE_RE = /\b(send|post|publish|delete|revoke|submit|confirm)\b/;
const MONETARY_RE = /\b(pay|buy|order|subscribe|transfer|checkout|purchase)\b/;
const DESTRUCTIVE_RE = /\b(delete|revoke)\b/;

export type ResolveResult = { readonly ok: true; readonly resolved: ResolvedAction } | { readonly ok: false; readonly reason: string };

function detectConsequence(text: string): Consequence {
  if (MONETARY_RE.test(text)) return 'monetary';
  if (IRREVERSIBLE_RE.test(text)) return 'irreversible';
  return 'reversible';
}

function detectTier(kind: string, consequence: Consequence): Tier {
  if (consequence === 'monetary') return 'transact';
  if (kind === 'navigate') return 'read';
  return 'interact'; // click, type, select, submit, fill_secret are state-changing
}

export function resolve(proposal: ActionProposal, snapshot: Snapshot): ResolveResult {
  if (proposal.snapshot_ref.snapshot_id !== snapshot.snapshot_id || proposal.snapshot_ref.nav_epoch !== snapshot.nav_epoch) {
    return { ok: false, reason: 'snapshot_mismatch' };
  }
  if (snapshot.nav_epoch !== snapshot.handle_epoch) {
    return { ok: false, reason: 'stale_snapshot' };
  }
  const node = snapshot.nodes.find((n) => n.node_id === proposal.target_node);
  if (node === undefined) return { ok: false, reason: 'node_absent' };

  const form = node.form_ref === null ? null : snapshot.forms.find((f) => f.form_id === node.form_ref) ?? null;

  const lexText = (node.name + ' ' + node.role).toLowerCase();
  const detectedConsequence = detectConsequence(lexText);
  const detectedTier = detectTier(node.kind, detectedConsequence);
  const destructive = DESTRUCTIVE_RE.test(lexText);

  const method = form?.method ?? (node.kind === 'navigate' ? 'GET' : 'NONE');
  const endpoint = form?.action ?? node.href ?? null;

  let payload_classes: PayloadField[] = [];
  if (node.kind === 'submit' && form !== null) payload_classes = [...form.fields];
  else if (node.field_class !== null) payload_classes = [{ field_class: node.field_class, secret_scope: node.secret_scope }];

  const amount_minor = form?.amount_minor ?? null;
  const currency = form?.currency ?? null;

  const tier_effective = maxTier(proposal.declared.tier, detectedTier);
  const consequence_effective = maxConsequence(proposal.declared.consequence, detectedConsequence);

  const mismatches: string[] = [];
  if (proposal.declared.origin !== snapshot.origin) mismatches.push('origin');
  if (proposal.declared.tier !== detectedTier) mismatches.push('tier');
  if (proposal.declared.consequence !== detectedConsequence) mismatches.push('consequence');
  if (proposal.declared.amount_minor !== amount_minor) mismatches.push('amount');

  const resolved: ResolvedAction = {
    proposal_ref: proposal.proposal_id,
    workspace_id: proposal.workspace_id,
    origin: snapshot.origin,
    nav_epoch: snapshot.nav_epoch,
    target_digest: node.digest,
    form_digest: form?.form_digest ?? null,
    method,
    endpoint,
    payload_classes,
    amount_minor,
    currency,
    entity_count: snapshot.entity_count[node.node_id] ?? 1,
    destructive,
    token_id: proposal.token_id,
    secret_ref: proposal.secret_ref,
    tier_effective,
    consequence_effective,
    mismatches,
    kind: node.kind,
    handle_ref: proposal.handle_ref,
  };
  return { ok: true, resolved };
}
