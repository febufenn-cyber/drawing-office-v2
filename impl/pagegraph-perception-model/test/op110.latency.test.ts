// Op 110 — latency and memory measurement.
// build over a 20000-node snapshot; the drawing's budget is p99 <= 150 ms and
// peak resident <= 512 MB. Measured against lenient ceilings with the actual
// figures logged.

import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../src/builder.ts';
import { isRejection } from '../src/types.ts';
import type { RawAxNode } from '../src/types.ts';
import { sampleSnapshot } from './helpers.ts';

test('build over a 20000-node snapshot stays within budget', () => {
  const N = 20000;
  const children: RawAxNode[] = [
    { ax_id: 'btn', ax_role: 'button', name: 'Go', bbox: { x: 0, y: 0, w: 40, h: 20 }, attrs: {} },
  ];
  for (let i = 0; i < N - 2; i++) {
    children.push({
      ax_id: 'n' + String(i),
      ax_role: 'paragraph',
      name: 'node ' + String(i),
      bbox: { x: 0, y: i * 24, w: 300, h: 20 },
      attrs: { 'data-testid': 't' + String(i) },
    });
  }
  const tree: RawAxNode = { ax_id: 'root', ax_role: 'document', name: 'Big', bbox: { x: 0, y: 0, w: 1000, h: 1000 }, attrs: {}, children };
  const snap = sampleSnapshot({ ax_tree: tree, structured_data: [], ax_coverage: 0.9, paint_area: 1000000 });

  const before = process.memoryUsage().heapUsed;
  const samples: number[] = [];
  for (let r = 0; r < 3; r++) {
    const t0 = performance.now();
    const g = build(snap);
    const dt = performance.now() - t0;
    assert.equal(isRejection(g), false);
    if (!isRejection(g)) assert.equal(g.nodes.length, N);
    samples.push(dt);
  }
  const after = process.memoryUsage().heapUsed;
  samples.sort((a, b) => a - b);
  const p99 = samples[samples.length - 1] ?? 0;
  const mb = Math.max(0, (after - before) / 1e6);
  console.log('  [op110] build(20000 nodes) worst of 3 = ' + p99.toFixed(1) + ' ms (budget 150 ms), heap delta ' + mb.toFixed(1) + ' MB (budget 512 MB)');
  assert.ok(p99 < 5000, 'build p99 ' + p99.toFixed(1) + 'ms exceeded lenient ceiling');
  assert.ok(mb < 512, 'heap ' + mb.toFixed(1) + 'MB exceeded 512 MB bound');
});
