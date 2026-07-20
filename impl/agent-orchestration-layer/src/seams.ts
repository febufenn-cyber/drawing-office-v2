// The external subsystems DO-020 consumes, each an interface with test stubs.
// DO-016 executor (runs sub-agent DAGs under a budget hook, reports actuals),
// DO-019 ledger (read-only month spend + workspace cap), DO-017 router (an
// independent verify role), and DO-012 action control plane (the human gate every
// transact-tier action still crosses). Plus a durable workspace store and clock.

import type { Actual, Claim, Partial, Request, SubAgentDag } from './types.ts';

// DO-016 task DAG executor: runs a sub-agent DAG under a reserved slice and reports
// consumed tokens and time. A step whose reserved slice is exhausted halts and the
// result carries a gap marker.
export interface ExecResult {
  readonly partial: Partial;
  readonly actual: Actual;
}
export interface Executor {
  submit(dag: SubAgentDag, budget_hook: Request): ExecResult;
}

// DO-019 workspace and budget ledger: read-only. DO-020 reads month-to-date spend
// and the workspace cap; it never writes the ledger.
export interface Ledger {
  month_spent(workspace: string): number;
  workspace_cap(workspace: string): number;
}

// DO-017 model router: an independent verify role plus a per-claim support check.
export interface Router {
  verify_role(producing: readonly string[]): string; // distinct from every producing role
  supported(role: string, claim: Claim): boolean;
}

// DO-012 action control plane: the human gate. Every transact-tier action a
// background task takes crosses this regardless of budget headroom.
export interface AcpProposal {
  readonly workspace_id: string;
  readonly task_id: string;
  readonly tier: 'read' | 'act' | 'transact';
  readonly amount_minor: number;
}
export interface AcpDecision {
  readonly decision: 'allow' | 'gate' | 'deny';
}
export interface ActionControlPlane {
  submit(proposal: AcpProposal): AcpDecision;
}

// Durable per-workspace KV + append for the trigger-store.
export interface PutAck {
  readonly durable: boolean;
}
export interface WorkspaceStore {
  put(key: string, value: string, durable: boolean): PutAck;
  get(key: string): string | null;
  append(key: string, value: string, durable: boolean): PutAck;
  readAll(key: string): readonly string[];
}

// Epoch-seconds clock, injected so the trigger engine is testable with a fake clock.
export interface Clock {
  now(): number;
}
