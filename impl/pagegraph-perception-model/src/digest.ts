// P7 — node-digest. The content-and-geometry fingerprint of a node subtree: the
// counterpart to the stable id. The id survives content change; the digest changes
// when content changes. Covers precisely what the id excludes — geometry bucket
// and current values — plus ordered child digests. Byte-identical for equal
// subtrees. Must run after affordance inventory, since it covers affordance
// metadata.

import { canonical, sha256hex } from './canonical.ts';
import type { Spine } from './types.ts';

export function digestAll(spine: Spine): void {
  const memo = new Map<string, string>();

  const compute = (ax_id: string): string => {
    const cached = memo.get(ax_id);
    if (cached !== undefined) return cached;
    const node = spine.nodes.get(ax_id);
    if (node === undefined) return sha256hex('missing');
    const child_digests = node.children_ax_ids.map(compute);
    const body = canonical({
      role: node.role,
      attrs: node.attrs,
      name: node.name,
      geometry: node.geometry_bucket,
      affordance: node.affordance,
      value_mask: node.value_mask,
      child_digests,
    });
    const d = sha256hex(body);
    memo.set(ax_id, d);
    return d;
  };

  for (const ax_id of spine.order) {
    const node = spine.nodes.get(ax_id);
    if (node !== undefined) node.digest = compute(ax_id);
  }
}

export function digestRoot(spine: Spine): string {
  const digests = spine.order.map((id) => spine.nodes.get(id)?.digest ?? '');
  return sha256hex(canonical(digests));
}
