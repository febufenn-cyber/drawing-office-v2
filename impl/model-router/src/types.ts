// DO-017 types. The router names no concrete provider SDK; providers sit behind
// the ProviderTransport seam, the budget manager (DO-020) behind an interface,
// and the workspace key source (DO-019) behind a KeySource.

export type Role = 'plan' | 'extract' | 'classify' | 'verify';
export type ModelClass = 'frontier' | 'fast';
export type Axis = 'model' | 'family' | 'provider';
export type SourceKind = 'byok' | 'managed';

export const ROLES = new Set<Role>(['plan', 'extract', 'classify', 'verify']);
export const MODEL_CLASSES = new Set<ModelClass>(['frontier', 'fast']);
export const AXES = new Set<Axis>(['model', 'family', 'provider']);

export interface ModelBinding {
  readonly model_id: string;
  readonly provider: string;
  readonly endpoint: string;
  readonly model_class: ModelClass;
  readonly family: string;
}

export interface PriceEntry {
  readonly input_minor_per_ktok: number;
  readonly output_minor_per_ktok: number;
  readonly currency: string;
}

export interface Policy {
  readonly policy_rev: number;
  readonly workspace_id: string;
  readonly role_class: Readonly<Partial<Record<Role, ModelClass>>>; // verify omitted by design
  readonly pools: Readonly<Record<ModelClass, readonly ModelBinding[]>>;
  readonly prices: Readonly<Record<string, PriceEntry>>;
  readonly independence_axis: Axis;
  readonly provider_timeout_ms: number;
}

export interface ProducerTag {
  readonly model_id: string;
  readonly family: string;
  readonly provider: string;
  readonly model_class: ModelClass;
  readonly mac: string;
}

export interface RouteRequest {
  readonly workspace_id: string;
  readonly role: Role;
  readonly prompt_bundle: string;
  readonly prompt_tokens: number;
  readonly max_output: number;
  readonly producer_tag?: ProducerTag;
}

export type RouteStatus =
  | 'routed'
  | 'invalid_request'
  | 'independence_unsatisfiable'
  | 'key_missing'
  | 'budget_denied'
  | 'provider_error';

export interface Completion {
  readonly text: string;
}
export interface Usage {
  readonly input_tokens: number;
  readonly output_tokens: number;
}
export interface CostEstimate {
  readonly model_id: string;
  readonly cost_minor: number;
  readonly currency: string;
}
export interface CostRecord {
  readonly workspace_id: string;
  readonly call_id: string;
  readonly role: Role;
  readonly model_id: string;
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cost_minor: number;
  readonly currency: string;
  readonly ts: string;
}
export interface RouteResult {
  readonly status: RouteStatus;
  readonly binding?: ModelBinding;
  readonly completion?: Completion;
  readonly usage?: Usage;
  readonly cost?: CostRecord;
  readonly producer_tag?: ProducerTag;
  readonly policy_rev?: number;
}

export interface KeyHandle {
  readonly workspace_id: string;
  readonly provider: string;
  readonly source: SourceKind;
}

export interface Rejection {
  readonly rejected: true;
  readonly reason: string;
}
export function reject(reason: string): Rejection {
  return { rejected: true, reason };
}
export function isRejection(v: unknown): v is Rejection {
  return typeof v === 'object' && v !== null && (v as { rejected?: unknown }).rejected === true;
}

// DO-020 budget manager (feedback edge; built against a stub here).
export interface BudgetManager {
  admit(workspace_id: string, estimate: CostEstimate): 'admit' | 'deny';
  record(rec: CostRecord): void;
}
