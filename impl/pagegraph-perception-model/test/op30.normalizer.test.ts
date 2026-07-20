// Op 30 — P2 accessibility-normalizer.
// Every emitted node carries a NodeRole from the closed enum and provenance
// source accessibility; hidden and presentational nodes dropped; identical
// fixture yields an identical spine; geometry buckets quantized to the grid.

import test from 'node:test';
import assert from 'node:assert/strict';
import { canonical } from '../src/canonical.ts';
import { normalize } from '../src/normalizer.ts';
import { NODE_ROLES } from '../src/types.ts';
import type { Spine } from '../src/types.ts';
import { ax, sampleSnapshot } from './helpers.ts';

function serialize(spine: Spine): string {
  return canonical(spine.order.map((id) => {
    const n = spine.nodes.get(id);
    return { id, role: n?.role, name: n?.name, geo: n?.geometry_bucket, prov: n?.provenance };
  }));
}

test('every node is typed to the closed enum and provenance-tagged', () => {
  const spine = normalize(sampleSnapshot());
  for (const n of spine.nodes.values()) {
    assert.equal(NODE_ROLES.has(n.role), true);
    assert.equal(n.provenance.source, 'accessibility');
    assert.equal(n.provenance.captured_at.length > 0, true);
  }
});

test('hidden nodes are dropped', () => {
  const spine = normalize(sampleSnapshot());
  assert.equal(spine.nodes.has('hid'), false);
  assert.equal(spine.nodes.has('h1'), true);
});

test('geometry is bucketed to the 16px grid', () => {
  const spine = normalize(
    sampleSnapshot({ ax_tree: ax('root', 'document', { name: 'D', bbox: { x: 33, y: 40, w: 100, h: 20 } }) }),
  );
  const root = spine.nodes.get('root');
  assert.deepEqual(root?.geometry_bucket, { gx: 2, gy: 2, gw: 6, gh: 1 });
});

test('an unmapped AX role becomes unknown, never a guess', () => {
  const spine = normalize(sampleSnapshot({ ax_tree: ax('root', 'marquee', { name: 'X' }) }));
  assert.equal(spine.nodes.get('root')?.role, 'unknown');
});

test('identical fixture yields an identical spine', () => {
  assert.equal(serialize(normalize(sampleSnapshot())), serialize(normalize(sampleSnapshot())));
});
