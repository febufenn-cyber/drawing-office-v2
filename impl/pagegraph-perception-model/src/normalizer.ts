// P2 — accessibility-normalizer. Normalizes the accessibility tree into the typed
// node spine: maps AX roles to the closed NodeRole enum, drops hidden and
// presentational nodes, normalizes names, buckets geometry to a 16px grid, records
// stable and volatile attributes, and stamps provenance. Deterministic: identical
// input yields an identical spine.

import type { GeometryBucket, NodeRole, RawAxNode, Snapshot, Spine, WorkingNode } from './types.ts';

const GRID = 16;

// Total AX-role -> NodeRole map. An unmapped role becomes 'unknown', never a guess.
const AX_ROLE_MAP: Readonly<Record<string, NodeRole>> = {
  document: 'document', main: 'region', region: 'region', article: 'region',
  heading: 'heading', paragraph: 'paragraph', text: 'paragraph',
  link: 'link', button: 'button',
  textbox: 'textbox', searchbox: 'textbox', checkbox: 'checkbox', radio: 'radio',
  combobox: 'select', listbox: 'select', option: 'option',
  img: 'image', image: 'image',
  list: 'list', listitem: 'listitem',
  form: 'form', table: 'table', cell: 'cell', gridcell: 'cell',
};

// AX roles that mark boilerplate landmarks; their descendants are excluded from
// main content by the content-extractor.
const BOILERPLATE_ROLES = new Set(['navigation', 'banner', 'contentinfo', 'complementary']);

// Durable attribute keys (feed the stable id); everything else is volatile.
function isStableKey(k: string): boolean {
  return k === 'id' || k === 'name' || k === 'data-testid' || k.startsWith('aria-');
}

function geometryBucket(b: { x: number; y: number; w: number; h: number }): GeometryBucket {
  return {
    gx: Math.floor(b.x / GRID),
    gy: Math.floor(b.y / GRID),
    gw: Math.floor(b.w / GRID),
    gh: Math.floor(b.h / GRID),
  };
}

function normalizeName(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

export function normalize(snapshot: Snapshot): Spine {
  const spine: Spine = { order: [], nodes: new Map<string, WorkingNode>() };

  const visit = (raw: RawAxNode, ancestorBoilerplate: boolean): string | null => {
    if (raw.hidden === true || raw.presentational === true) return null;
    const boilerplate = ancestorBoilerplate || BOILERPLATE_ROLES.has(raw.ax_role);
    const attrs = { ...(raw.attrs ?? {}) };
    const stableKeys = Object.keys(attrs).filter(isStableKey).sort();

    const children_ax_ids: string[] = [];
    const node: WorkingNode = {
      ax_id: raw.ax_id,
      role: AX_ROLE_MAP[raw.ax_role] ?? 'unknown',
      ax_role: raw.ax_role,
      name: normalizeName(raw.name),
      value_mask: raw.value_mask ?? null,
      geometry_bucket: geometryBucket(raw.bbox),
      attrs,
      stable_attr_keys: stableKeys,
      children_ax_ids,
      boilerplate,
      is_content: false,
      provenance: { source_node: raw.ax_id, source: 'accessibility', captured_at: snapshot.captured_at },
      node_id: '',
      affordance: null,
      digest: '',
      role_path: [],
    };
    spine.nodes.set(raw.ax_id, node);
    spine.order.push(raw.ax_id);

    for (const child of raw.children ?? []) {
      const cid = visit(child, boilerplate);
      if (cid !== null) children_ax_ids.push(cid);
    }
    return raw.ax_id;
  };

  visit(snapshot.ax_tree, false);
  return spine;
}
