// DO-015 types: the typed SiteAdapter contract, the exploration Trajectory, and
// the health/drift records. Engine-neutral: anchors are PageGraph stable node
// identities, never raw selectors.

export type ToolKind = 'search' | 'extract' | 'act' | 'navigate';
export type ActionKind = 'open' | 'click' | 'type' | 'select' | 'submit' | 'read';
export type BindingKind = 'literal' | 'param' | 'extract';

export const TOOL_KINDS = new Set<ToolKind>(['search', 'extract', 'act', 'navigate']);
export const ACTION_KINDS = new Set<ActionKind>(['open', 'click', 'type', 'select', 'submit', 'read']);

// A closed field-type descriptor. `kind: list` means a list of records with these
// fields; `record` means one record.
export type FieldType = 'string' | 'number' | 'boolean';
export interface Schema {
  readonly kind: 'record' | 'list';
  readonly fields: Readonly<Record<string, FieldType>>;
}

export interface NodeAnchor {
  readonly role: string;
  readonly name_pattern: string;
  readonly structural_digest: string;
}

export interface ParamBinding {
  readonly kind: BindingKind;
  readonly param_ref: string | null;
  readonly literal: string | null;
  readonly extract_field: string | null;
}

export interface ProvenanceRef {
  readonly trajectory_id: string;
  readonly step_index: number;
  readonly observed_at: string;
}

export interface Step {
  readonly seq: number;
  readonly anchor: NodeAnchor;
  readonly action: ActionKind;
  readonly binding: ParamBinding;
  readonly read_fields: readonly string[];
  readonly provenance: ProvenanceRef;
}

export interface Assertion {
  readonly kind: 'non_empty_list' | 'record_complete';
  readonly field: string | null;
}

export type ParamSet = Readonly<Record<string, string>>;

export interface Tool {
  readonly name: string;
  readonly kind: ToolKind;
  readonly params_schema: Schema;
  readonly return_schema: Schema;
  readonly steps: readonly Step[];
  readonly golden_params: ParamSet;
  readonly assertions: readonly Assertion[];
  readonly provenance: readonly ProvenanceRef[];
}

export interface SiteAdapter {
  readonly adapter_id: string;
  readonly origin: string;
  readonly version: number;
  readonly tools: readonly Tool[];
  readonly trajectory_ref: string;
  readonly replay_digest: string;
  readonly compiled_at: string;
}

// ---- Trajectory (P2 output, P3 input) --------------------------------------

export interface TrajectoryStep {
  readonly seq: number;
  readonly intent: string;
  readonly pre_ref: string;
  readonly anchor: NodeAnchor;
  readonly action: ActionKind;
  readonly literal: string | null; // the value typed/selected, if any
  readonly param_candidate: boolean; // marked variable during exploration
  readonly read_fields: readonly string[];
  readonly post_ref: string;
  readonly observed_at: string;
}

export interface Trajectory {
  readonly trajectory_id: string;
  readonly origin: string;
  readonly steps: readonly TrajectoryStep[];
}

// ---- Health and drift ------------------------------------------------------

export type ToolStatus = 'healthy' | 'drifted' | 'broken';
export interface ToolHealth {
  readonly name: string;
  readonly status: ToolStatus;
  readonly detail: string;
}
export interface HealthReport {
  readonly adapter_id: string;
  readonly version: number;
  readonly ts: string;
  readonly tools: readonly ToolHealth[];
}

export interface DriftReport {
  readonly origin: string;
  readonly adapter_status: ToolStatus;
  readonly signal_relearn: boolean;
}

// ---- Results ---------------------------------------------------------------

export interface ActionRecord {
  readonly stable_id: string;
  readonly action: ActionKind;
  readonly value: string | null;
}
export interface ToolResult {
  readonly ok: boolean;
  readonly error: string | null;
  readonly value: unknown; // a record, or a list of records, per the tool return schema
  readonly actions: readonly ActionRecord[];
  readonly provenance: readonly ProvenanceRef[];
}
