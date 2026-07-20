// P3 — content-extractor. Selects the main-content nodes, excludes boilerplate,
// and returns them in document reading order. Attaches to existing spine nodes; it
// never creates free-floating text.

import type { NodeRole, Spine } from './types.ts';

const CONTENT_ROLES = new Set<NodeRole>([
  'heading', 'paragraph', 'list', 'listitem', 'table', 'cell', 'image',
]);

// Returns the main-content ax_ids in document order; the builder maps them to
// node_ids. Boilerplate-descended nodes (nav, header, footer, aside) are excluded
// by the normalizer's boilerplate flag.
export function extract(spine: Spine): string[] {
  const main: string[] = [];
  for (const ax_id of spine.order) {
    const node = spine.nodes.get(ax_id);
    if (node === undefined || node.boilerplate) continue;
    if (CONTENT_ROLES.has(node.role)) {
      node.is_content = true;
      main.push(ax_id);
    }
  }
  return main;
}
