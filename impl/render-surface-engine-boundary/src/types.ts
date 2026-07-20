// DO-013 shared contract types.
//
// These are the engine-neutral types every caller above L0 sees. They name no
// Chromium or CDP type, which is what lets the engine be swapped (Op 110).

export type WorkspaceId = string;
export type HandleId = string;
export type NodeId = string; // a stable per-node digest; never a raw CSS selector
export type PartitionId = string;
export type SurfaceId = string;

// The RenderSurface action kinds. `fill_secret` names the gated fill path so a
// fill carries an action digest like any other consequential action.
export type ActionKind =
  | 'click'
  | 'type'
  | 'select'
  | 'submit'
  | 'navigate'
  | 'fill_secret';

export interface WorkspaceCtx {
  readonly workspace_id: WorkspaceId;
  readonly partition_key: string;
}

export interface Action {
  readonly kind: ActionKind;
  readonly node_id: NodeId;
  readonly value?: string;
}

export interface ExecutionTicket {
  readonly ticket_id: string;
  readonly action_digest: string; // hex64 of the resolved action
  readonly nav_epoch: number;
  readonly expiry: string; // iso8601
  readonly mac: string; // hex, HMAC over the ticket body under the session key
}

export interface PageHandle {
  readonly handle_id: HandleId;
}

export interface PgNode {
  readonly node_id: NodeId; // equals the node's stable digest
  readonly role: string;
  readonly name: string;
  readonly masked: boolean;
  readonly value: string | null; // null when masked or valueless
}

export interface PageGraph {
  readonly nav_epoch: number;
  readonly workspace_id: WorkspaceId;
  readonly nodes: readonly PgNode[];
  readonly digest_root: string; // hex64 over the ordered node digests
}

export interface Mark {
  readonly mark: number;
  readonly node_id: NodeId;
}

export interface Img {
  readonly width: number;
  readonly height: number;
  readonly bytes: string; // opaque encoded pixels
  readonly marks: readonly Mark[]; // set-of-marks overlay; empty when unmarked
}

export type FillResult = boolean;

export interface SecretRef {
  readonly ref: string;
  readonly scope: string;
}

export type PageEvent =
  | { readonly kind: 'nav'; readonly handle_id: HandleId; readonly nav_epoch: number; readonly seq: number }
  | { readonly kind: 'network'; readonly handle_id: HandleId; readonly detail: string; readonly seq: number }
  | { readonly kind: 'mutation'; readonly handle_id: HandleId; readonly detail: string; readonly seq: number };
