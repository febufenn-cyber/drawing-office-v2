// DO-014 types: the PageGraph schema, the raw snapshot input, and the internal
// working spine. The schema names no engine type; the raw snapshot is what
// RenderSurface (DO-013) supplies as the sole page input above L0.

// ---- Closed enums ----------------------------------------------------------

export type NodeRole =
  | 'document' | 'region' | 'heading' | 'paragraph' | 'link' | 'button'
  | 'textbox' | 'checkbox' | 'radio' | 'select' | 'option' | 'image'
  | 'list' | 'listitem' | 'form' | 'table' | 'cell' | 'unknown';

export type AffordanceKind =
  | 'click' | 'type' | 'select' | 'submit' | 'navigate' | 'fill_secret' | 'none';

export type FieldClass =
  | 'text' | 'identifier' | 'credential_ref' | 'payment' | 'address' | 'search' | 'free_form';

export type SourceChannel =
  | 'accessibility' | 'readability' | 'structured_data' | 'affordance' | 'vision';

export const NODE_ROLES = new Set<NodeRole>([
  'document', 'region', 'heading', 'paragraph', 'link', 'button', 'textbox',
  'checkbox', 'radio', 'select', 'option', 'image', 'list', 'listitem', 'form',
  'table', 'cell', 'unknown',
]);
export const AFFORDANCE_KINDS = new Set<AffordanceKind>([
  'click', 'type', 'select', 'submit', 'navigate', 'fill_secret', 'none',
]);
export const FIELD_CLASSES = new Set<FieldClass>([
  'text', 'identifier', 'credential_ref', 'payment', 'address', 'search', 'free_form',
]);
export const SOURCE_CHANNELS = new Set<SourceChannel>([
  'accessibility', 'readability', 'structured_data', 'affordance', 'vision',
]);

// ---- Schema (the emitted PageGraph) ----------------------------------------

export interface GeometryBucket {
  readonly gx: number;
  readonly gy: number;
  readonly gw: number;
  readonly gh: number;
}

export interface Provenance {
  readonly source_node: string;
  readonly source: SourceChannel;
  readonly captured_at: string;
}

export interface Affordance {
  readonly kind: AffordanceKind;
  readonly method: string | null;
  readonly action_target: string | null;
  readonly field_class: FieldClass | null;
  readonly secret_scope: string | null;
}

export interface Node {
  readonly node_id: string;
  readonly role: NodeRole;
  readonly name: string;
  readonly value_mask: string | null;
  readonly geometry_bucket: GeometryBucket;
  readonly affordance: Affordance | null;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children_ids: readonly string[];
  readonly digest: string;
  readonly provenance: Provenance;
}

export interface Entity {
  readonly entity_type: string;
  readonly props: Readonly<Record<string, unknown>>;
  readonly source_node_ids: readonly string[];
  readonly provenance: Provenance;
}

export interface PageGraph {
  readonly workspace_id: string;
  readonly nav_epoch: number;
  readonly url: string;
  readonly origin: string;
  readonly captured_at: string;
  readonly root_id: string;
  readonly nodes: readonly Node[];
  readonly entities: readonly Entity[];
  readonly main_content_ids: readonly string[];
  readonly digest_root: string;
  readonly source: SourceChannel; // 'accessibility' for the DOM path, 'vision' for fallback
}

// ---- Raw snapshot input (from RenderSurface / DO-013) -----------------------

export interface RawAxNode {
  readonly ax_id: string;
  readonly ax_role: string;
  readonly name: string;
  readonly hidden?: boolean;
  readonly presentational?: boolean;
  readonly bbox: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly attrs?: Readonly<Record<string, string>>;
  readonly value_mask?: string | null;
  readonly text?: string;
  readonly children?: readonly RawAxNode[];
}

export interface RawStructuredBlock {
  readonly format: 'json-ld' | 'microdata' | 'opengraph';
  readonly well_formed: boolean;
  readonly entity_type: string;
  readonly props: Readonly<Record<string, unknown>>;
  readonly source_ax_ids: readonly string[];
}

export interface VisionMark {
  readonly mark: number;
  readonly role: NodeRole;
  readonly kind: 'click' | 'type';
}

export interface Snapshot {
  readonly workspace_id: string;
  readonly nav_epoch: number;
  readonly url: string;
  readonly origin: string;
  readonly captured_at: string;
  readonly ax_tree: RawAxNode;
  readonly structured_data: readonly RawStructuredBlock[];
  readonly paint_area: number;
  readonly ax_coverage: number; // 0..1
  readonly marks?: readonly VisionMark[]; // set-of-marks the vision stub would read
}

// ---- Internal working spine (not part of the emitted schema) ---------------

export interface WorkingNode {
  ax_id: string;
  role: NodeRole;
  ax_role: string;
  name: string;
  value_mask: string | null;
  geometry_bucket: GeometryBucket;
  attrs: Record<string, string>;
  stable_attr_keys: string[];
  children_ax_ids: string[];
  boilerplate: boolean;
  is_content: boolean;
  provenance: Provenance;
  node_id: string; // assigned by P6
  affordance: Affordance | null; // assigned by P5
  digest: string; // assigned by P7
  role_path: string[]; // computed by P6
}

export interface Spine {
  order: string[]; // ax_ids in document order
  nodes: Map<string, WorkingNode>;
}

// ---- Rejection -------------------------------------------------------------

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
