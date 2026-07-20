// P1 — pagegraph-schema. Validates the emitted PageGraph: roles and enum values,
// required fields, child-reference integrity, and mandatory provenance on every
// node and entity. Rejection is total, never partial.

import {
  AFFORDANCE_KINDS,
  FIELD_CLASSES,
  NODE_ROLES,
  reject,
  SOURCE_CHANNELS,
} from './types.ts';
import type { Node, PageGraph, Provenance, Rejection } from './types.ts';

function validProvenance(p: unknown): p is Provenance {
  if (typeof p !== 'object' || p === null) return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.source_node === 'string' &&
    typeof o.source === 'string' &&
    SOURCE_CHANNELS.has(o.source as Provenance['source']) &&
    typeof o.captured_at === 'string' &&
    o.captured_at.length > 0
  );
}

function validateNode(n: Node, ids: Set<string>): Rejection | null {
  if (!NODE_ROLES.has(n.role)) return reject('unknown_role:' + n.role);
  if (typeof n.node_id !== 'string' || n.node_id.length === 0) return reject('bad_node_id');
  if (typeof n.name !== 'string') return reject('bad_name');
  if (typeof n.digest !== 'string' || n.digest.length === 0) return reject('missing_digest');
  if (!validProvenance(n.provenance)) return reject('missing_provenance:' + n.node_id);
  if (n.affordance !== null) {
    const a = n.affordance;
    if (!AFFORDANCE_KINDS.has(a.kind)) return reject('bad_affordance_kind');
    if (a.field_class !== null && !FIELD_CLASSES.has(a.field_class)) return reject('bad_field_class');
  }
  for (const c of n.children_ids) if (!ids.has(c)) return reject('dangling_child:' + c);
  return null;
}

export function validate(graph: PageGraph): PageGraph | Rejection {
  if (typeof graph.digest_root !== 'string' || graph.digest_root.length === 0) return reject('missing_digest_root');
  if (!SOURCE_CHANNELS.has(graph.source)) return reject('bad_graph_source');
  // A raw-HTML field must never appear on the graph.
  if ('html' in (graph as unknown as Record<string, unknown>)) return reject('raw_html_present');

  const ids = new Set<string>();
  for (const n of graph.nodes) {
    if (ids.has(n.node_id)) return reject('duplicate_node_id:' + n.node_id);
    ids.add(n.node_id);
  }
  if (!ids.has(graph.root_id)) return reject('root_not_in_nodes');
  for (const n of graph.nodes) {
    const r = validateNode(n, ids);
    if (r !== null) return r;
  }
  for (const e of graph.entities) {
    if (!validProvenance(e.provenance)) return reject('entity_missing_provenance');
    if (e.source_node_ids.length === 0) return reject('entity_no_source_node');
    for (const s of e.source_node_ids) if (!ids.has(s)) return reject('entity_dangling_source:' + s);
  }
  for (const c of graph.main_content_ids) if (!ids.has(c)) return reject('main_content_dangling:' + c);
  return graph;
}
