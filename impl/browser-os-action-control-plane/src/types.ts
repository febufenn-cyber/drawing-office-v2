// DO-012 types: the P1 typed contracts, the closed enums, and the PageGraph
// snapshot view the resolver consumes. Engine- and storage-neutral.

export type Verdict = 'ALLOW' | 'CONFIRM' | 'BLOCK';
export const VERDICT_ORDER: Readonly<Record<Verdict, number>> = { ALLOW: 0, CONFIRM: 1, BLOCK: 2 };

export type Tier = 'read' | 'interact' | 'transact';
export const TIER_ORDER: Readonly<Record<Tier, number>> = { read: 0, interact: 1, transact: 2 };

export type Consequence = 'reversible' | 'irreversible' | 'monetary';
export const CONSEQUENCE_ORDER: Readonly<Record<Consequence, number>> = { reversible: 0, irreversible: 1, monetary: 2 };

export type ActionKind = 'click' | 'type' | 'select' | 'submit' | 'navigate' | 'fill_secret';
export type FieldClass = 'text' | 'identifier' | 'credential_ref' | 'payment' | 'address' | 'free_form';

export const TIERS = new Set<Tier>(['read', 'interact', 'transact']);
export const CONSEQUENCES = new Set<Consequence>(['reversible', 'irreversible', 'monetary']);
export const ACTION_KINDS = new Set<ActionKind>(['click', 'type', 'select', 'submit', 'navigate', 'fill_secret']);

export function maxTier(a: Tier, b: Tier): Tier {
  return TIER_ORDER[a] >= TIER_ORDER[b] ? a : b;
}
export function maxConsequence(a: Consequence, b: Consequence): Consequence {
  return CONSEQUENCE_ORDER[a] >= CONSEQUENCE_ORDER[b] ? a : b;
}

// ---- P1 contracts ----------------------------------------------------------

export interface SnapshotRef {
  readonly snapshot_id: string;
  readonly nav_epoch: number;
}

export interface DeclaredIntent {
  readonly intent_text: string;
  readonly origin: string;
  readonly tier: Tier;
  readonly consequence: Consequence;
  readonly amount_minor: number | null;
  readonly currency: string | null;
}

export interface ActionProposal {
  readonly proposal_id: string;
  readonly workspace_id: string;
  readonly handle_ref: string;
  readonly kind: ActionKind;
  readonly target_node: string;
  readonly snapshot_ref: SnapshotRef;
  readonly declared: DeclaredIntent;
  readonly token_id: string | null;
  readonly secret_ref: string | null;
  readonly task_ref: string;
}

export interface PayloadField {
  readonly field_class: FieldClass;
  readonly secret_scope: string | null;
}

export interface ResolvedAction {
  readonly proposal_ref: string;
  readonly workspace_id: string;
  readonly origin: string;
  readonly nav_epoch: number;
  readonly target_digest: string;
  readonly form_digest: string | null;
  readonly method: string;
  readonly endpoint: string | null;
  readonly payload_classes: readonly PayloadField[];
  readonly amount_minor: number | null;
  readonly currency: string | null;
  readonly entity_count: number;
  readonly destructive: boolean;
  readonly token_id: string | null;
  readonly secret_ref: string | null;
  readonly tier_effective: Tier;
  readonly consequence_effective: Consequence;
  readonly mismatches: readonly string[];
  readonly kind: ActionKind;
  readonly handle_ref: string;
}

export interface Finding {
  readonly severity: Verdict;
  readonly code: string;
  readonly detail: string;
}

export interface Decision {
  readonly verdict: Verdict;
  readonly findings: readonly Finding[];
  readonly proposal_ref: string | null;
  readonly policy_rev: number | null;
  readonly decided_at: string;
}

// ---- PageGraph snapshot view (from DO-014 / RenderSurface) ------------------

export interface SnapForm {
  readonly form_id: string;
  readonly action: string;
  readonly method: string;
  readonly form_digest: string;
  readonly amount_minor: number | null;
  readonly currency: string | null;
  readonly fields: readonly PayloadField[];
}

export interface SnapNode {
  readonly node_id: string;
  readonly digest: string;
  readonly role: string;
  readonly name: string;
  readonly kind: ActionKind;
  readonly form_ref: string | null;
  readonly href: string | null;
  readonly field_class: FieldClass | null;
  readonly secret_scope: string | null;
}

export interface Snapshot {
  readonly snapshot_id: string;
  readonly nav_epoch: number;
  readonly handle_epoch: number; // the handle's CURRENT epoch, for staleness
  readonly workspace_id: string;
  readonly origin: string;
  readonly url: string;
  readonly nodes: readonly SnapNode[];
  readonly forms: readonly SnapForm[];
  readonly entity_count: Readonly<Record<string, number>>;
}
