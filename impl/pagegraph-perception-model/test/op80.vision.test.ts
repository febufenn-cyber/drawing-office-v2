// Op 80 — P8 vision-fallback.
// Set-of-marks nodes numbered one through n with click or type affordances and
// vision provenance; the path runs only when the DOM quality gate reports fail; a
// populated accessibility tree never triggers it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../src/builder.ts';
import { normalize } from '../src/normalizer.ts';
import { domQuality } from '../src/vision.ts';
import { isRejection } from '../src/types.ts';
import { ax, sampleSnapshot } from './helpers.ts';

function degenerate() {
  return sampleSnapshot({
    ax_tree: ax('root', 'document', { name: 'Canvas' }, [ax('c', 'paragraph', { name: '' })]),
    structured_data: [],
    ax_coverage: 0.1,
    paint_area: 500000,
    marks: [
      { mark: 1, role: 'button', kind: 'click' },
      { mark: 2, role: 'textbox', kind: 'type' },
    ],
  });
}

test('the DOM gate passes on a populated tree and fails on a degenerate one', () => {
  assert.equal(domQuality(normalize(sampleSnapshot()), sampleSnapshot()), 'pass');
  const deg = degenerate();
  assert.equal(domQuality(normalize(deg), deg), 'fail');
});

test('a gate failure routes to vision with typed, vision-provenanced mark nodes', () => {
  const g = build(degenerate());
  if (isRejection(g)) throw new Error('build failed');
  assert.equal(g.source, 'vision');
  const marks = g.nodes.filter((n) => n.node_id.startsWith('mark-'));
  assert.equal(marks.length, 2);
  assert.deepEqual(marks.map((n) => n.node_id).sort(), ['mark-1', 'mark-2']);
  for (const n of marks) {
    assert.equal(n.provenance.source, 'vision');
    assert.equal(n.affordance?.kind === 'click' || n.affordance?.kind === 'type', true);
  }
});

test('a populated accessibility tree never triggers vision', () => {
  const g = build(sampleSnapshot());
  if (isRejection(g)) throw new Error('build failed');
  assert.equal(g.source, 'accessibility');
  assert.equal(g.nodes.some((n) => n.provenance.source === 'vision'), false);
});
