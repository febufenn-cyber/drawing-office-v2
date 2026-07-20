// Op 10 — P1 pagegraph-schema.
// Canonical bytes identical across key orderings; graphs with unknown roles,
// out-of-enum values, missing fields, and dangling child references rejected.

import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../src/builder.ts';
import { canonical } from '../src/canonical.ts';
import { validate } from '../src/schema.ts';
import { isRejection } from '../src/types.ts';
import type { PageGraph } from '../src/types.ts';
import { sampleSnapshot } from './helpers.ts';

function builtGraph(): PageGraph {
  const g = build(sampleSnapshot());
  if (isRejection(g)) throw new Error('build failed: ' + g.reason);
  return g;
}

test('canonical serialization is key-order independent', () => {
  assert.equal(canonical({ a: 1, b: [2, 3], c: 'x' }), canonical({ c: 'x', b: [2, 3], a: 1 }));
});

test('a well-formed graph validates', () => {
  assert.equal(isRejection(validate(builtGraph())), false);
});

test('an unknown role is rejected', () => {
  const g = builtGraph();
  const nodes = g.nodes.map((n, i) => (i === 1 ? { ...n, role: 'widget' as unknown as typeof n.role } : n));
  assert.equal(isRejection(validate({ ...g, nodes })), true);
});

test('a missing provenance is rejected', () => {
  const g = builtGraph();
  const nodes = g.nodes.map((n, i) => (i === 1 ? { ...n, provenance: { source_node: '', source: 'accessibility' as const, captured_at: '' } } : n));
  assert.equal(isRejection(validate({ ...g, nodes })), true);
});

test('a dangling child reference is rejected', () => {
  const g = builtGraph();
  const nodes = g.nodes.map((n, i) => (i === 0 ? { ...n, children_ids: [...n.children_ids, 'ghost'] } : n));
  assert.equal(isRejection(validate({ ...g, nodes })), true);
});

test('a raw html field is rejected', () => {
  const g = builtGraph();
  assert.equal(isRejection(validate({ ...g, html: '<div>' } as unknown as PageGraph)), true);
});
