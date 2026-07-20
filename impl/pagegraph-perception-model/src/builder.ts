// P9 — pagegraph-builder. The sole entry point and the only part that touches the
// raw snapshot. Drives normalization, id assignment, fusion, digesting, and
// provenance stamping into one typed PageGraph, or routes to vision on gate
// failure. Construction is deterministic end to end.

import { extract } from './content.ts';
import { digestAll, digestRoot } from './digest.ts';
import { inventory } from './affordance.ts';
import { normalize } from './normalizer.ts';
import { parse } from './structuredData.ts';
import { assign } from './stableId.ts';
import { validate } from './schema.ts';
import { buildFromMarks, domQuality } from './vision.ts';
import { reject } from './types.ts';
import type { Node, PageGraph, Rejection, Snapshot, Spine } from './types.ts';

function project(spine: Spine): Node[] {
  return spine.order.map((ax_id) => {
    const n = spine.nodes.get(ax_id);
    if (n === undefined) throw new Error('spine order references missing node ' + ax_id);
    const children_ids = n.children_ax_ids.map((c) => {
      const child = spine.nodes.get(c);
      if (child === undefined) throw new Error('missing child ' + c);
      return child.node_id;
    });
    return {
      node_id: n.node_id,
      role: n.role,
      name: n.name,
      value_mask: n.value_mask,
      geometry_bucket: n.geometry_bucket,
      affordance: n.affordance,
      attrs: n.attrs,
      children_ids,
      digest: n.digest,
      provenance: n.provenance,
    };
  });
}

export function build(snapshot: Snapshot): PageGraph | Rejection {
  const spine = normalize(snapshot);
  if (spine.order.length === 0) return reject('empty_spine');

  if (domQuality(spine, snapshot) === 'fail') {
    return validate(buildFromMarks(snapshot));
  }

  assign(spine); // P6 — must precede structured-data linking
  const mainContentAx = extract(spine); // P3
  inventory(spine); // P5 — must precede digest
  digestAll(spine); // P7
  const entities = parse(snapshot, spine); // P4
  const digest_root = digestRoot(spine);

  const nodes = project(spine);
  const rootAx = spine.order[0] as string;
  const root_id = spine.nodes.get(rootAx)?.node_id ?? '';
  const main_content_ids = mainContentAx
    .map((ax) => spine.nodes.get(ax)?.node_id)
    .filter((id): id is string => id !== undefined);

  const graph: PageGraph = {
    workspace_id: snapshot.workspace_id,
    nav_epoch: snapshot.nav_epoch,
    url: snapshot.url,
    origin: snapshot.origin,
    captured_at: snapshot.captured_at,
    root_id,
    nodes,
    entities,
    main_content_ids,
    digest_root,
    source: 'accessibility',
  };
  return validate(graph);
}
