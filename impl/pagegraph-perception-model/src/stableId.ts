// P6 — stable-id-assigner. Assigns each node a drift-stable id from durable
// signals only: role, normalized name, stable attributes, and the role-path from
// the nearest landmark. Excludes raw sibling index, volatile attribute values,
// class lists, and geometry, so minor DOM drift does not churn the id. Collisions
// resolve deterministically by ordinal.

import { canonical, sha256hex } from './canonical.ts';
import type { NodeRole, Spine, WorkingNode } from './types.ts';

const ID_WIDTH = 32; // hex chars = 128 bits
const LANDMARKS = new Set<NodeRole>(['document', 'region', 'form']);

function parentMap(spine: Spine): Map<string, string> {
  const parent = new Map<string, string>();
  for (const n of spine.nodes.values()) for (const c of n.children_ax_ids) parent.set(c, n.ax_id);
  return parent;
}

// Roles from the nearest landmark ancestor down to the immediate parent — walks
// roles, never indices, so inserting an unrelated sibling does not shift it.
function rolePath(node: WorkingNode, spine: Spine, parent: Map<string, string>): string[] {
  const chain: string[] = [];
  let cur = parent.get(node.ax_id);
  while (cur !== undefined) {
    const p = spine.nodes.get(cur);
    if (p === undefined) break;
    chain.push(p.role);
    if (LANDMARKS.has(p.role)) break;
    cur = parent.get(cur);
  }
  return chain.reverse();
}

function stableAttrs(node: WorkingNode): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of node.stable_attr_keys) {
    const v = node.attrs[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export function assign(spine: Spine): void {
  const parent = parentMap(spine);
  const assigned = new Set<string>();
  const nextOrdinal = new Map<string, number>();

  for (const ax_id of spine.order) {
    const node = spine.nodes.get(ax_id);
    if (node === undefined) continue;
    node.role_path = rolePath(node, spine, parent);
    const key = canonical([node.role, node.name, stableAttrs(node), node.role_path]);

    let ordinal = nextOrdinal.get(key) ?? 0;
    let id = ordinal === 0 ? sha256hex(key).slice(0, ID_WIDTH) : sha256hex(key + '#' + String(ordinal)).slice(0, ID_WIDTH);
    while (assigned.has(id)) {
      ordinal += 1;
      id = sha256hex(key + '#' + String(ordinal)).slice(0, ID_WIDTH);
    }
    nextOrdinal.set(key, ordinal + 1);
    node.node_id = id;
    assigned.add(id);
  }
}
