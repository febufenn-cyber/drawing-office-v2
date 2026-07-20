// DO-020 Agent Orchestration Layer — public surface. Fans out agents under enforced
// per-task budgets and runs scheduled and event-driven background tasks over the
// task DAG executor, so the machine works while the user does not.

export * from './types.ts';
export type {
  AcpDecision, AcpProposal, ActionControlPlane, Clock, ExecResult, Executor,
  Ledger, PutAck, Router, WorkspaceStore,
} from './seams.ts';
export { canonical, sha256hex } from './canonical.ts';
export { BudgetManager } from './budget.ts';
export { merge, verify } from './merge.ts';
export { FanoutScheduler, partition, type FanoutDeps, type FanoutResult } from './fanout.ts';
export { largestLE, nextAfter } from './schedule.ts';
export { TriggerStore } from './triggerStore.ts';
export { tick, type Runner } from './triggerEngine.ts';
export { BackgroundRunner, type RunnerDeps, type RunOutcome } from './runner.ts';
