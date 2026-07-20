// Op 120 — provenance, determinism, and fallback battery end to end.
// Every extracted fact resolves to a source node and timestamp; degenerate
// fixtures trigger the vision path exactly once and produce a typed graph; a
// populated accessibility tree never triggers vision; repeated runs are
// byte-identical.

import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../src/builder.ts';
import { canonical } from '../src/canonical.ts';
import { isRejection } from '../src/types.ts';
import { ax, sampleSnapshot } from './helpers.ts';

test('every extracted fact resolves to a source node and timestamp', () => {
  const g = build(sampleSnapshot());
  if (isRejection(g)) throw new Error('build failed');
  const ids = new Set(g.nodes.map((n) => n.node_id));
  for (const n of g.nodes) {
    assert.ok(n.provenance.source_node.length > 0 && n.provenance.captured_at.length > 0);
  }
  for (const e of g.entities) {
    assert.ok(e.provenance.captured_at.length > 0);
    for (const s of e.source_node_ids) assert.equal(ids.has(s), true);
  }
});

test('a canvas-only fixture triggers the vision path exactly once', () => {
  const canvasOnly = sampleSnapshot({
    ax_tree: ax('root', 'document', { name: 'Canvas' }),
    structured_data: [],
    ax_coverage: 0.05,
    paint_area: 800000,
    marks: [{ mark: 1, role: 'button', kind: 'click' }],
  });
  const g = build(canvasOnly);
  if (isRejection(g)) throw new Error('build failed');
  assert.equal(g.source, 'vision');
  assert.equal(g.nodes.filter((n) => n.node_id.startsWith('mark-')).length, 1);
});

test('a populated fixture never triggers vision and is deterministic', () => {
  const a = build(sampleSnapshot());
  const b = build(sampleSnapshot());
  if (isRejection(a) || isRejection(b)) throw new Error('build failed');
  assert.equal(a.source, 'accessibility');
  assert.equal(canonical(a), canonical(b));
});
