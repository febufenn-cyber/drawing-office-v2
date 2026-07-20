// The external subsystems DO-018 consumes, each an interface with test stubs.
// DO-013 RenderSurface (sandbox open / snapshot / act), DO-017 model router
// (generalizer and verifier roles, with distinct identities enforcing verifier
// independence), and DO-019 workspace store (durable KV + append). The executor
// (DO-016) is the caller of this subsystem, not a dependency stubbed here.

import type { ActionKind, Parameter, Trajectory } from './types.ts';

// DO-019 workspace store: durable per-workspace KV + append log. A durable write
// flushes before its ack.
export interface PutAck {
  readonly durable: boolean;
}
export interface WorkspaceStore {
  put(key: string, value: string, durable: boolean): PutAck;
  get(key: string): string | null;
  append(key: string, value: string, durable: boolean): PutAck;
  readAll(key: string): readonly string[];
}

// DO-013 RenderSurface, restricted to what the verifier needs: open a partition,
// read a snapshot, and act by stable node id. The verifier opens only a sandbox
// partition.
export interface SnapshotNode {
  readonly stable_id: string;
  readonly role: string;
  readonly name: string;
  readonly structural_path: string;
}
export interface Snapshot {
  readonly snapshot_ref: string;
  readonly nodes: readonly SnapshotNode[];
}
export interface SandboxAction {
  readonly stable_id: string;
  readonly kind: ActionKind;
  readonly value: string | null;
}
export interface OpenContext {
  readonly partition: string;
  readonly sandbox: boolean;
}
export interface ActResult {
  readonly ok: boolean;
}
export interface RenderSurface {
  open(ctx: OpenContext): string; // returns a handle bound to the partition
  snapshot(handle: string): Snapshot;
  act(handle: string, action: SandboxAction): ActResult;
}

// DO-017 model router. `identity(role)` names the model bound to a role so the
// verifier can refuse to grade its own work. `lift` is the generalizing pass
// (proposer); `grade` is the verifier pass (judge).
export interface LiftResult {
  readonly parameters: readonly Parameter[];
  // action index -> parameter name for each value the model marks varied
  readonly param_binding: Readonly<Record<number, string>>;
}
export interface ModelRouter {
  identity(role: string): string;
  lift(role: string, trajectory: Trajectory): LiftResult;
  grade(role: string, outputs: Readonly<Record<string, unknown>>, postconditions: readonly string[]): 'reproduced' | 'diverged';
}

export interface Clock {
  now(): string;
}
