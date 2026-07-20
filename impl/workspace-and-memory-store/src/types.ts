// DO-019 shared types. Engine-neutral, storage-neutral: these name no SQLite,
// SQLCipher, or sqlite-vec type. The persistence substrate sits behind the
// partition seam (partition.ts).

export type WorkspaceId = string;
export type PartitionId = string;

export type LifecycleState = 'active' | 'archived' | 'deleted';
export type LifecycleEvent = 'archive' | 'delete' | 'reopen';
export type Tier = 'read' | 'interact' | 'transact';

export const TIER_ORDER: Readonly<Record<Tier, number>> = { read: 0, interact: 1, transact: 2 };

export interface Rejection {
  readonly rejected: true;
  readonly reason: string;
}

export interface CredentialScope {
  readonly origins: readonly string[];
  readonly max_tier: Tier;
}

export interface Budget {
  readonly currency: string;
  readonly per_action_minor: number;
  readonly per_month_minor: number;
}

export interface Workspace {
  readonly workspace_id: WorkspaceId;
  readonly goal: string;
  readonly state: LifecycleState;
  readonly partition_id: PartitionId;
  readonly credential_scope: CredentialScope;
  readonly budget: Budget;
  readonly created_at: string;
  readonly archived_at: string | null;
}

// P4 episodic-store
export type OutcomeStatus = 'succeeded' | 'failed' | 'abandoned';
export interface Step {
  readonly ordinal: number;
  readonly action_digest: string;
  readonly observation_ref: string;
}
export interface Outcome {
  readonly status: OutcomeStatus;
  readonly detail: string;
}
export interface Episode {
  readonly episode_id: string;
  readonly task_ref: string;
  readonly started_at: string;
  readonly ended_at: string;
  readonly outcome: Outcome;
  readonly steps: readonly Step[];
  readonly embedding: readonly number[];
}
export interface EpisodeFilter {
  readonly task_ref?: string;
  readonly outcome?: OutcomeStatus;
  readonly from?: string;
  readonly to?: string;
}

// P5 entity-graph
export interface Entity {
  readonly entity_id: string;
  readonly kind: string;
  readonly label: string;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly embedding: readonly number[];
  readonly updated_at: string;
}
export interface Relation {
  readonly src: string;
  readonly dst: string;
  readonly kind: string;
  readonly created_at: string;
}

// P6 skill-store
export type SkillStatus = 'promoted' | 'demoted';
export interface SkillDraft {
  readonly skill_id: string;
  readonly signature: string;
  readonly body_ref: string;
}
export interface SkillRecord {
  readonly skill_id: string;
  readonly version: number;
  readonly signature: string;
  readonly body_ref: string;
  readonly status: SkillStatus;
  readonly created_at: string;
}

// P8 budget-ledger
export interface BudgetState {
  readonly workspace_id: WorkspaceId;
  readonly credential_scope: CredentialScope;
  readonly caps: Budget;
}
export interface LedgerEntry {
  readonly seq: number;
  readonly ts: string;
  readonly amount_minor: number;
  readonly currency: string;
  readonly ref: string;
}

// P3 key-provisioner
export interface WorkspaceKeys {
  readonly data_key: Buffer;
  readonly partition_id: PartitionId;
}

export function isRejection(v: unknown): v is Rejection {
  return typeof v === 'object' && v !== null && (v as { rejected?: unknown }).rejected === true;
}

export function reject(reason: string): Rejection {
  return { rejected: true, reason };
}
