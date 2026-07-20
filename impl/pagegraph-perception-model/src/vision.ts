// P8 — vision-fallback. Runs only when the DOM quality gate fails. Turns
// set-of-marks numbers into typed nodes with click or type affordances and vision
// provenance, producing a degraded but typed PageGraph. Vision costs about ten
// times the DOM path, so the gate must hold.

import { canonical, sha256hex } from './canonical.ts';
import type { GeometryBucket, Node, NodeRole, PageGraph, Snapshot, Spine } from './types.ts';

const TRIVIAL_PAINT = 1000; // px^2 below which an empty spine is unremarkable
const COVERAGE_THRESHOLD = 0.5;
const INTERACTABLE: ReadonlySet<NodeRole> = new Set<NodeRole>([
  'button', 'link', 'textbox', 'checkbox', 'radio', 'select',
]);
const ZERO_GEOMETRY: GeometryBucket = { gx: 0, gy: 0, gw: 0, gh: 0 };

export function domQuality(spine: Spine, snapshot: Snapshot): 'pass' | 'fail' {
  let interactables = 0;
  for (const n of spine.nodes.values()) if (INTERACTABLE.has(n.role)) interactables++;
  if (interactables === 0 && snapshot.paint_area > TRIVIAL_PAINT) return 'fail';
  if (snapshot.ax_coverage < COVERAGE_THRESHOLD) return 'fail';
  return 'pass';
}

export function buildFromMarks(snapshot: Snapshot): PageGraph {
  const marks = snapshot.marks ?? [];
  const markNodes: Node[] = marks.map((m) => ({
    node_id: 'mark-' + String(m.mark),
    role: m.role,
    name: '',
    value_mask: null,
    geometry_bucket: ZERO_GEOMETRY,
    affordance: {
      kind: m.kind === 'click' ? 'click' : 'type',
      method: null,
      action_target: null,
      field_class: m.kind === 'type' ? 'text' : null,
      secret_scope: null,
    },
    attrs: {},
    children_ids: [],
    digest: sha256hex(canonical({ mark: m.mark, role: m.role, kind: m.kind })),
    provenance: { source_node: 'mark-' + String(m.mark), source: 'vision', captured_at: snapshot.captured_at },
  }));

  const root: Node = {
    node_id: 'vision-root',
    role: 'document',
    name: '',
    value_mask: null,
    geometry_bucket: ZERO_GEOMETRY,
    affordance: null,
    attrs: {},
    children_ids: markNodes.map((n) => n.node_id),
    digest: sha256hex('vision-root'),
    provenance: { source_node: 'vision-root', source: 'vision', captured_at: snapshot.captured_at },
  };

  const nodes = [root, ...markNodes];
  const digest_root = sha256hex(canonical(nodes.map((n) => n.digest)));
  return {
    workspace_id: snapshot.workspace_id,
    nav_epoch: snapshot.nav_epoch,
    url: snapshot.url,
    origin: snapshot.origin,
    captured_at: snapshot.captured_at,
    root_id: 'vision-root',
    nodes,
    entities: [],
    main_content_ids: [],
    digest_root,
    source: 'vision',
  };
}
