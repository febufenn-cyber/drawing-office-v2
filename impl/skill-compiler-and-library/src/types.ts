// DO-018 types: the Skill (a parameterized action script over stable node
// locators, not a recording), the source Trajectory it is compiled from, the
// library record, and the lifecycle results. A skill survives minor DOM drift by
// resolving its locators to fresh stable node ids against the replay snapshot.

export type SkillStatus = 'candidate' | 'promoted' | 'demoted' | 'relearning';
export type ActionKind = 'click' | 'type' | 'select' | 'submit' | 'navigate' | 'extract';
// The commit class of a step. A terminal irreversible/monetary step is bound and
// resolved during verification but never committed in the sandbox.
export type CommitClass = 'none' | 'irreversible' | 'monetary';

export const SKILL_STATUSES = new Set<SkillStatus>(['candidate', 'promoted', 'demoted', 'relearning']);
export const ACTION_KINDS = new Set<ActionKind>(['click', 'type', 'select', 'submit', 'navigate', 'extract']);

export interface Parameter {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
}

export interface NodeLocator {
  readonly role: string;
  readonly name_pattern: string;
  readonly structural_path: string;
}

// Sets one action field from either a named parameter or a compile-time literal.
// `source` is 'param:NAME' or 'lit:VALUE'.
export interface Binding {
  readonly field: string;
  readonly source: string;
}

export interface SkillStep {
  readonly index: number;
  readonly kind: ActionKind;
  readonly locator: NodeLocator;
  readonly bindings: readonly Binding[];
  readonly commit: CommitClass;
}

export interface Guard {
  readonly subject: string;
  readonly relation: string;
  readonly value: string;
}

export interface Provenance {
  readonly trajectory_ref: string;
  readonly generalizing_model: string;
  readonly source_digest: string;
}

export interface Skill {
  readonly skill_id: string;
  readonly signature: string;
  readonly version: number;
  readonly parameters: readonly Parameter[];
  readonly steps: readonly SkillStep[];
  readonly guards: readonly Guard[];
  readonly postconditions: readonly string[];
  readonly provenance: Provenance;
  readonly status: SkillStatus;
}

// ---- Source trajectory (P2 input, from DO-016) -----------------------------

export interface TrajectoryAction {
  readonly index: number;
  readonly kind: ActionKind;
  readonly node_id: string; // concrete stable id in the source snapshot
  readonly role: string;
  readonly name: string;
  readonly structural_path: string;
  readonly field: string | null; // the action field a value binds to
  readonly value: string | null; // the concrete value used
  readonly commit: CommitClass;
}

export interface Trajectory {
  readonly trajectory_id: string;
  readonly signature: string;
  readonly source_inputs: Readonly<Record<string, string>>; // task params -> concrete values
  readonly actions: readonly TrajectoryAction[];
  readonly outputs: Readonly<Record<string, unknown>>;
  readonly postconditions: readonly string[];
}

// ---- Library records and lookups (P4) --------------------------------------

export interface SkillRecord {
  readonly signature: string;
  readonly version: number;
  readonly skill: Skill;
  status: SkillStatus;
}

export interface NearestResult {
  readonly skill: Skill;
  readonly unbound: readonly number[]; // step indices whose locators do not bind
}

// ---- Results ---------------------------------------------------------------

export type GeneralizeResult =
  | { readonly ok: true; readonly candidate: Skill }
  | { readonly ok: false; readonly reason: 'SHAPE_INVALID' | 'SOURCE_DIVERGED' };

export type VerifyResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'VERIFIER_NOT_INDEPENDENT' | 'LOCATOR_UNBOUND' | 'OUTPUT_DIVERGED' };

export type PromoteResult =
  | { readonly ok: true; readonly skill_id: string; readonly version: number }
  | { readonly ok: false; readonly reason: string };

export type ValidateResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };
