// Op 20 — P7 node-digest.
// Digest byte-identical for equal subtrees; a change to a covered field changes
// it; an unrelated node change leaves a node's digest unchanged.

import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../src/builder.ts';
import { isRejection } from '../src/types.ts';
import type { PageGraph } from '../src/types.ts';
import { ax, sampleSnapshot } from './helpers.ts';

function g(over = {}): PageGraph {
  const r = build(sampleSnapshot(over));
  if (isRejection(r)) throw new Error('build failed');
  return r;
}

function digestOf(graph: PageGraph, name: string): string {
  const n = graph.nodes.find((x) => x.name === name);
  if (n === undefined) throw new Error('no node ' + name);
  return n.digest;
}

test('equal snapshots yield equal per-node digests', () => {
  const a = g();
  const b = g();
  assert.deepEqual(a.nodes.map((n) => n.digest), b.nodes.map((n) => n.digest));
});

test('a geometry change moves the digest but not the id', () => {
  const base = g();
  // Shift the heading geometry only.
  const shifted = sampleSnapshot({
    paint_area: 500, // trivial paint: an interactable-free spine still passes the DOM gate
    ax_tree: ax('root', 'document', { name: 'Doc' }, [
      ax('main', 'main', { name: 'Main' }, [
        ax('h1', 'heading', { name: 'Great Laptop', bbox: { x: 200, y: 400, w: 320, h: 20 } }),
      ]),
    ]),
  });
  const s = build(shifted);
  if (isRejection(s)) throw new Error('build failed');
  const baseH = base.nodes.find((n) => n.name === 'Great Laptop');
  const shiftH = s.nodes.find((n) => n.name === 'Great Laptop');
  assert.ok(baseH && shiftH);
  assert.equal(baseH?.node_id, shiftH?.node_id); // id excludes geometry
  assert.notEqual(baseH?.digest, shiftH?.digest); // digest covers geometry
});

test('a name change moves that node digest', () => {
  const base = digestOf(g(), 'Great Laptop');
  const renamed = build(
    sampleSnapshot({
      paint_area: 500,
      ax_tree: ax('root', 'document', { name: 'Doc' }, [
        ax('main', 'main', { name: 'Main' }, [ax('h1', 'heading', { name: 'Different Laptop' })]),
      ]),
    }),
  );
  if (isRejection(renamed)) throw new Error('build failed');
  const changed = renamed.nodes.find((n) => n.name === 'Different Laptop')?.digest;
  assert.notEqual(base, changed);
});

test('every node carries a non-empty digest and no raw html field exists', () => {
  const graph = g();
  for (const n of graph.nodes) assert.equal(n.digest.length > 0, true);
  assert.equal('html' in graph, false);
});
