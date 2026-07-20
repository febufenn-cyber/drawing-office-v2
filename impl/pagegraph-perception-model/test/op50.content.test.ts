// Op 50 — P3 content-extractor.
// Main-content ids in document reading order; boilerplate removed; content maps to
// spine nodes.

import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../src/builder.ts';
import { isRejection } from '../src/types.ts';
import { nodeByName, sampleSnapshot } from './helpers.ts';

test('main content is the heading and paragraph in document order, boilerplate excluded', () => {
  const g = build(sampleSnapshot());
  if (isRejection(g)) throw new Error('build failed');
  const h1 = nodeByName(g, 'Great Laptop');
  const p1 = nodeByName(g, 'A fine machine.');
  const navlink = nodeByName(g, 'Home');
  assert.ok(h1 && p1 && navlink);
  assert.deepEqual(g.main_content_ids, [h1?.node_id, p1?.node_id]);
  // The nav link is boilerplate and never enters main content.
  assert.equal(g.main_content_ids.includes(navlink?.node_id as string), false);
});

test('every main-content id resolves to a node in the graph', () => {
  const g = build(sampleSnapshot());
  if (isRejection(g)) throw new Error('build failed');
  const ids = new Set(g.nodes.map((n) => n.node_id));
  for (const id of g.main_content_ids) assert.equal(ids.has(id), true);
});
