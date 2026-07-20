// Op 40 — P6 stable-id-assigner.
// Ids collision-free within a graph; identical spine yields identical ids; the
// durable-signal rule excludes volatile attribute values and geometry (id is
// stable across those) but changes on a durable signal.

import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../src/normalizer.ts';
import { assign } from '../src/stableId.ts';
import type { Spine } from '../src/types.ts';
import { ax, sampleSnapshot } from './helpers.ts';

function ids(spine: Spine): Map<string, string> {
  const m = new Map<string, string>();
  for (const id of spine.order) {
    const n = spine.nodes.get(id);
    if (n !== undefined) m.set(id, n.node_id);
  }
  return m;
}

function assigned(over = {}): Spine {
  const spine = normalize(sampleSnapshot(over));
  assign(spine);
  return spine;
}

test('ids are collision-free within a graph', () => {
  const spine = assigned();
  const seen = new Set<string>();
  for (const n of spine.nodes.values()) {
    assert.equal(seen.has(n.node_id), false);
    seen.add(n.node_id);
  }
});

test('identical spine yields identical ids', () => {
  assert.deepEqual([...ids(assigned())], [...ids(assigned())]);
});

test('a volatile attribute change does not churn the id', () => {
  const base = assigned();
  const churned = assigned({
    ax_tree: ax('root', 'document', { name: 'Doc' }, [
      ax('main', 'main', { name: 'Main' }, [
        ax('h1', 'heading', { name: 'Great Laptop', attrs: { class: 'x9 promo-blink' }, bbox: { x: 99, y: 12, w: 40, h: 8 } }),
      ]),
    ]),
  });
  const plain = assigned({
    ax_tree: ax('root', 'document', { name: 'Doc' }, [
      ax('main', 'main', { name: 'Main' }, [ax('h1', 'heading', { name: 'Great Laptop' })]),
    ]),
  });
  void base;
  assert.equal(churned.nodes.get('h1')?.node_id, plain.nodes.get('h1')?.node_id);
});

test('a durable-signal change (name) changes the id', () => {
  const a = assigned({
    ax_tree: ax('root', 'document', { name: 'Doc' }, [ax('h1', 'heading', { name: 'Alpha' })]),
  });
  const b = assigned({
    ax_tree: ax('root', 'document', { name: 'Doc' }, [ax('h1', 'heading', { name: 'Beta' })]),
  });
  assert.notEqual(a.nodes.get('h1')?.node_id, b.nodes.get('h1')?.node_id);
});
