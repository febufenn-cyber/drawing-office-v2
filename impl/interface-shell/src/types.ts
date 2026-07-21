// DO-021 types: the human-surface view-models. The interface shell is a pure
// projection over the agent layers — it displays runs, it never advances one. A
// task card is a pure function of DO-016 run state; the activity feed is a pure
// function of the run log; the approval sheet is the visual side of DO-012's
// approval contract and binds every response to a request_id.

// ---- Run-log events consumed from DO-016 -----------------------------------

export type RunEventName =
  | 'run.started' | 'step.ready' | 'step.strategy_chosen' | 'step.pre_dispatch'
  | 'action.submitted' | 'perception.read' | 'step.succeeded' | 'step.failed'
  | 'step.skipped' | 'step.in_doubt' | 'run.paused' | 'run.resumed'
  | 'run.completed' | 'replay.started';

export interface RunEvent {
  readonly seq: number;
  readonly ts: string;
  readonly event: RunEventName;
  readonly data: Readonly<Record<string, unknown>>;
}

// ---- P1 intent-box ---------------------------------------------------------

export interface ShellTask {
  readonly kind: 'navigate' | 'intent';
  readonly origin: string | null; // set for navigate
  readonly url: string | null; // set for navigate
  readonly text: string; // the intent text (or the URL)
}

// ---- P2 task-card-model ----------------------------------------------------

export type CardStatus = 'submitted' | 'planning' | 'running' | 'done' | 'failed';
export type StepStatus = 'pending' | 'ready' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'in_doubt';

export interface PlanStep {
  readonly step_id: string;
  readonly label: string;
  readonly status: StepStatus;
}

export interface TaskCard {
  readonly task_id: string;
  readonly workspace_id: string;
  readonly title: string;
  readonly status: CardStatus;
  readonly plan: readonly PlanStep[];
  readonly activity_ref: string;
  readonly artifact_refs: readonly string[];
  readonly evidence_refs: readonly string[];
  readonly updated_seq: number;
}

// ---- P3 activity-stream ----------------------------------------------------

export type ActivityKind = 'lifecycle' | 'step' | 'action' | 'evidence' | 'alert';

export interface ActivityItem {
  readonly seq: number;
  readonly ts: string;
  readonly kind: ActivityKind;
  readonly text: string;
  readonly ref: string | null;
}

// ---- P4 approval-sheet -----------------------------------------------------

export interface ApprovalRequest {
  readonly request_id: string;
  readonly origin: string; // page-origin string
  readonly consequence: string;
  readonly amount_minor: number | null;
  readonly currency: string | null;
  readonly finding_codes: readonly string[];
  readonly expires_at: number; // epoch seconds
  readonly page_strings: readonly string[]; // page-origin content
}

export interface Decision {
  readonly request_id: string;
  readonly approved: boolean;
  readonly operator_ref: string;
  readonly note: string | null;
}

export interface ApprovalResponse {
  readonly request_id: string;
  readonly approved: boolean;
  readonly operator_ref: string;
  readonly note: string | null;
}

// Every field a page could control is labeled page content, so a page cannot
// impersonate the shell to the approver.
export interface LabeledField {
  readonly label: 'page content' | 'shell';
  readonly field: string;
  readonly value: string;
}
export interface RenderedSheet {
  readonly request_id: string;
  readonly consequence: string;
  readonly amount_minor: number | null;
  readonly currency: string | null;
  readonly finding_codes: readonly string[];
  readonly expires_at: number;
  readonly fields: readonly LabeledField[]; // origin + page strings, each labeled page content
}

export type RespondResult =
  | { readonly ok: true; readonly response: ApprovalResponse }
  | { readonly ok: false; readonly reason: 'LAPSED' | 'REQUEST_MISMATCH' };

// ---- P5 evidence-panel -----------------------------------------------------

export type ArtifactKind = 'report' | 'table' | 'summary';

export interface Artifact {
  readonly ref: string;
  readonly kind: ArtifactKind;
  readonly title: string;
  readonly workspace_id: string;
}
export interface EvidencePage {
  readonly ref: string;
  readonly origin: string;
  readonly source_node: string;
  readonly captured_at: string;
}
export type StoredItem =
  | ({ readonly type: 'artifact' } & Artifact)
  | ({ readonly type: 'evidence' } & EvidencePage);

export interface EvidenceRow {
  readonly status: 'ok' | 'unavailable';
  readonly item_kind: 'artifact' | 'evidence';
  readonly ref: string;
  readonly label: 'page content' | 'shell';
  readonly detail: Readonly<Record<string, unknown>>;
}

// ---- P6 ambient-sidebar ----------------------------------------------------

export type SidebarState = 'hidden' | 'ambient' | 'focused' | 'approving';
