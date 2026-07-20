// DO-016 types: the TaskGraph schema, the per-step Checkpoint, the run-log entry,
// and the step result. A TaskGraph is an explicit DAG of typed steps; a run
// checkpoints each step and logs every lifecycle transition so any interruption
// resumes from the last good step and every finished run replays from its log.

export type StepKind = 'navigate' | 'extract' | 'compare' | 'fill' | 'verify';
export type StepStatus = 'pending' | 'ready' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'in_doubt';
export type StrategyKind = 'exact' | 'patched' | 'model';

export const STEP_KINDS = new Set<StepKind>(['navigate', 'extract', 'compare', 'fill', 'verify']);
// Consequential kinds cross the action control plane; the rest are read-only or reasoning.
export const CONSEQUENTIAL = new Set<StepKind>(['navigate', 'fill']);
export const PERCEPTION = new Set<StepKind>(['extract', 'verify']);

// A closed verify/guard expression over a step's resolved inputs or outputs.
export type Expr =
  | { readonly op: 'always' }
  | { readonly op: 'present'; readonly port: string }
  | { readonly op: 'non_empty'; readonly port: string }
  | { readonly op: 'equals'; readonly port: string; readonly value: string | number | boolean }
  | { readonly op: 'all'; readonly args: readonly Expr[] };

export interface Port {
  readonly name: string;
  readonly type: string;
}

export interface Step {
  readonly step_id: string;
  readonly kind: StepKind;
  readonly inputs: readonly Port[];
  readonly outputs: readonly Port[];
  readonly precondition: Expr;
  readonly postcondition: Expr;
  readonly signature: string;
}

export interface Edge {
  readonly from_step: string;
  readonly from_port: string;
  readonly to_step: string;
  readonly to_port: string;
}

export interface TaskGraph {
  readonly graph_id: string;
  readonly workspace_id: string;
  readonly steps: readonly Step[];
  readonly edges: readonly Edge[];
}

// ---- Checkpoint (P3) -------------------------------------------------------

export interface Checkpoint {
  readonly step_id: string;
  readonly input_digest: string;
  readonly status: StepStatus;
  readonly outputs: Readonly<Record<string, unknown>>;
  readonly attempt: number;
  readonly ts: string;
}

// ---- Run log (P6) ----------------------------------------------------------

export type RunEventName =
  | 'run.started' | 'step.ready' | 'step.strategy_chosen' | 'step.pre_dispatch'
  | 'action.submitted' | 'perception.read' | 'step.succeeded' | 'step.failed'
  | 'step.skipped' | 'step.in_doubt' | 'run.paused' | 'run.resumed'
  | 'run.completed' | 'replay.started';

export interface RunEntry {
  readonly seq: number;
  readonly ts: string;
  readonly event: RunEventName;
  readonly data: Readonly<Record<string, unknown>>;
}

// ---- Dispatch result (P4) --------------------------------------------------

export type Boundary = 'control_plane' | 'perception' | 'model';

export interface StepResult {
  readonly status: 'succeeded' | 'failed';
  readonly outputs: Readonly<Record<string, unknown>>;
  readonly strategy: StrategyKind;
  readonly boundary: Boundary;
  readonly snapshot_ref: string | null;
  readonly proposal_ref: string | null;
  readonly detail: string;
}

// ---- Validation results (P1) -----------------------------------------------

export type ValidateResult =
  | { readonly ok: true; readonly graph: TaskGraph }
  | { readonly ok: false; readonly reason: 'DUPLICATE_ID' | 'BAD_EDGE' | 'CYCLE'; readonly at: string };
