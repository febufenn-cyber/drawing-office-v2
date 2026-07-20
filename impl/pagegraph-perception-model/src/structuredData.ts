// P4 — structured-data-parser. Admits well-formed JSON-LD, microdata, and
// OpenGraph as typed entities linked to their source nodes; skips malformed blocks
// rather than repairing them by inference. Every entity links to at least one
// source node, so a claim traces back to the page position that made it. Runs
// after ids are assigned.

import type { Entity, Snapshot, Spine } from './types.ts';

export function parse(snapshot: Snapshot, spine: Spine): Entity[] {
  const out: Entity[] = [];
  for (const block of snapshot.structured_data) {
    if (!block.well_formed) continue; // skip, never guess
    const sourceIds: string[] = [];
    for (const ax_id of block.source_ax_ids) {
      const node = spine.nodes.get(ax_id);
      if (node !== undefined && node.node_id.length > 0) sourceIds.push(node.node_id);
    }
    if (sourceIds.length === 0) continue; // must link to at least one source node
    const first = sourceIds[0] as string;
    out.push({
      entity_type: block.entity_type,
      props: block.props,
      source_node_ids: sourceIds,
      provenance: { source_node: first, source: 'structured_data', captured_at: snapshot.captured_at },
    });
  }
  return out;
}
