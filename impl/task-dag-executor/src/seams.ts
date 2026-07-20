// The external subsystems this executor consumes, each an interface with test
// stubs. The executor never reaches an engine: perception is read-only through
// RenderSurface, every consequential effect crosses the DO-012 action control
// plane, model reasoning crosses the DO-017 router, skills come from the DO-018
// library, and durable persistence crosses the DO-019 workspace store. DO-018 is a
// register feedback edge (DO-016 <-> DO-018), so it is consumed here through a stub.

import type { StepKind } from './types.ts';

// DO-019 workspace store: durable per-workspace key-value plus append log. A
// durable write returns only after a flush to stable storage.
export interface PutAck {
  readonly durable: boolean;
}
export interface WorkspaceStore {
  put(key: string, value: string, durable: boolean): PutAck; // latest wins
  get(key: string): string | null;
  append(key: string, value: string, durable: boolean): PutAck; // append-only per key
  readAll(key: string): readonly string[];
}

// DO-012 action control plane: the only path to an act-class effect. The executor
// submits a proposal and receives a decision and result as data.
export interface ActionProposal {
  readonly workspace_id: string;
  readonly graph_id: string;
  readonly step_id: string;
  readonly kind: StepKind;
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly idempotency_key: string;
}
export interface ActionDecision {
  readonly decision: 'allow' | 'deny';
  readonly outputs: Readonly<Record<string, unknown>>;
  readonly proposal_ref: string;
}
export interface ActionControlPlane {
  submit(proposal: ActionProposal): ActionDecision;
}

// DO-013 RenderSurface: read-only perception. This subsystem never calls `act`.
export interface PerceptionSnapshot {
  readonly snapshot_ref: string;
  readonly values: Readonly<Record<string, unknown>>;
}
export interface RenderSurface {
  snapshot(handle: string): PerceptionSnapshot;
  observe(handle: string): PerceptionSnapshot;
}

// DO-017 model router: compare, gap-patch, and full-model reasoning.
export interface ModelResult {
  readonly outputs: Readonly<Record<string, unknown>>;
}
export interface ModelRouter {
  call(role: string, inputs: Readonly<Record<string, unknown>>): ModelResult;
}

// DO-018 skill library: strategy resolution pinned to a snapshot ref.
export interface Skill {
  readonly signature: string;
  readonly snapshot_ref: string;
}
export interface SkillLibrary {
  lookup_exact(signature: string, snapshot_ref: string): Skill | null;
  lookup_nearest(signature: string): Skill | null;
}

// An injected clock: tests supply a fixed clock for byte-deterministic records.
export interface Clock {
  now(): string;
}
