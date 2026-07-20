// DO-020 types: the per-task budget Ceiling/Reservation, the fan-out task and its
// partial results, the merge/verify artifact, and the trigger lifecycle records.
// The orchestration layer fans out agents under enforced budgets and runs
// scheduled and event-driven background tasks over the task DAG executor.

export interface Ceiling {
  readonly tokens: number;
  readonly seconds: number;
  readonly money_minor: number;
  readonly currency: string;
}

// A budget request (per sub-agent or per task). money_max is in minor units.
export interface Request {
  readonly tokens: number;
  readonly seconds: number;
  readonly money_max: number;
}

export interface Reservation {
  readonly reservation_id: string;
  readonly task_id: string;
  readonly tokens: number;
  readonly seconds: number;
  readonly money_max_minor: number;
  readonly granted: true;
}

export type DenyAxis = 'TOKEN_CEILING' | 'TIME_CEILING' | 'MONEY_CEILING';
export type ReserveResult =
  | { readonly granted: true; readonly reservation: Reservation }
  | { readonly granted: false; readonly reason: DenyAxis };

// Measured actuals at commit time.
export interface Actual {
  readonly tokens: number;
  readonly seconds: number;
  readonly money_minor: number;
}

// ---- Merge-verifier (P2) ---------------------------------------------------

export interface Claim {
  readonly key: string;
  readonly statement: string;
  readonly sources: readonly string[];
}
export interface Partial {
  readonly agent_id: string;
  readonly claims: readonly Claim[];
  readonly gap: boolean; // a budget-exhausted or failed sub-agent returns a gap marker
}
export interface Artifact {
  readonly claims: readonly Claim[];
  readonly gaps: readonly string[]; // agent_ids whose bucket was incomplete
}
export interface VerifyReport {
  readonly artifact: Artifact;
  readonly flagged: readonly string[]; // claim keys flagged unsupported (never removed)
  readonly verify_role: string;
}

// ---- Fan-out task (P1) -----------------------------------------------------

export interface ResearchTask {
  readonly id: string;
  readonly workspace: string;
  readonly page_set: readonly string[]; // stable page ids
  readonly ceiling: Ceiling;
  readonly per_page: Request; // budget request per page
  readonly producing_roles: readonly string[];
}
export interface SubAgentDag {
  readonly agent_id: string;
  readonly pages: readonly string[];
}

// ---- Triggers (P4/P5/P6) ---------------------------------------------------

export type TriggerKind = 'scheduled' | 'event';
export type TriggerState = 'armed' | 'firing' | 'paused' | 'expired';
export type RunState = 'started' | 'denied' | 'done';

// A schedule fires at anchor, anchor+interval, anchor+2*interval, ... (epoch seconds).
export interface Schedule {
  readonly interval_seconds: number;
  readonly anchor: number;
}
export interface EventSub {
  readonly event_type: string;
}
export interface TaskTemplate {
  readonly fans_out: boolean;
  readonly task: ResearchTask | null; // set when fans_out
  readonly width: number; // fan-out width when fans_out
  readonly dag: SubAgentDag | null; // set for a single task
  readonly request: Request; // budget request for the run
}
export interface Trigger {
  readonly trigger_id: string;
  readonly workspace_id: string;
  readonly kind: TriggerKind;
  readonly schedule: Schedule | null;
  readonly event_sub: EventSub | null;
  readonly task_template: TaskTemplate;
  readonly ceiling: Ceiling;
  next_fire_at: number | null;
  state: TriggerState;
  readonly expires_at: number | null;
}
export interface RunRecord {
  readonly run_id: string;
  readonly trigger_id: string;
  readonly started_at: number;
  readonly state: RunState;
  readonly artifact_ref: string | null;
}

export interface OrchestrationEvent {
  readonly type: string;
}
