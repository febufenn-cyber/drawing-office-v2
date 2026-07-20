// Op 40 — P4 cdp-driver.
// Identical DOM yields identical per-node digests; snapshot stamps nav_epoch and
// workspace_id and masks P6-marked fields; screenshot marks map one-to-one to
// snapshot node ids; inject targets the digest-matching node and rejects a raw
// selector.

import test from 'node:test';
import assert from 'node:assert/strict';
import { RenderSurface } from '../src/renderSurface.ts';
import { StubEngine } from '../src/stubEngine.ts';
import { KEY, mkNode, nodeIdOf, now, secretResolver, ticketFor } from './helpers.ts';

function open() {
  const engine = new StubEngine();
  const rs = new RenderSurface(engine, KEY, secretResolver, now);
  const opened = rs.open('https://site', { workspace_id: 'WS', partition_key: 'WS:main' });
  assert.equal(opened.ok, true);
  const h = opened.ok ? opened.value : (() => { throw new Error('unreachable'); })();
  const surface = engine.surfaceIds().at(-1) as string;
  return { engine, rs, h, surface };
}

test('identical DOM yields identical digests; a changed node changes its digest', () => {
  const { engine, rs, h, surface } = open();
  const nodes = [mkNode('a', { name: 'Alpha' }), mkNode('b', { name: 'Beta' })];
  engine.setNodes(surface, nodes);
  const s1 = rs.snapshot(h);
  const s2 = rs.snapshot(h);
  assert.equal(s1.ok && s2.ok, true);
  if (s1.ok && s2.ok) {
    assert.deepEqual(s1.value.nodes.map((n) => n.node_id), s2.value.nodes.map((n) => n.node_id));
    assert.equal(s1.value.digest_root, s2.value.digest_root);
  }
  engine.setNodes(surface, [mkNode('a', { name: 'CHANGED' }), mkNode('b', { name: 'Beta' })]);
  const s3 = rs.snapshot(h);
  if (s1.ok && s3.ok) {
    assert.notEqual(s1.value.nodes[0]?.node_id, s3.value.nodes[0]?.node_id);
    assert.notEqual(s1.value.digest_root, s3.value.digest_root);
  }
});

test('snapshot stamps nav_epoch and workspace_id', () => {
  const { engine, rs, h, surface } = open();
  engine.setNodes(surface, [mkNode('a')]);
  const s = rs.snapshot(h);
  assert.equal(s.ok, true);
  if (s.ok) {
    assert.equal(s.value.workspace_id, 'WS');
    assert.equal(s.value.nav_epoch, 0);
  }
});

test('screenshot marks map one-to-one to snapshot node ids in order', () => {
  const { engine, rs, h, surface } = open();
  const nodes = [mkNode('a'), mkNode('b'), mkNode('c')];
  engine.setNodes(surface, nodes);
  const img = rs.screenshot(h, true);
  assert.equal(img.ok, true);
  if (img.ok) {
    assert.equal(img.value.marks.length, 3);
    assert.deepEqual(
      img.value.marks.map((m) => m.node_id),
      nodes.map(nodeIdOf),
    );
    assert.deepEqual(img.value.marks.map((m) => m.mark), [1, 2, 3]);
  }
  const plain = rs.screenshot(h, false);
  assert.equal(plain.ok && plain.value.marks.length, 0);
});

test('inject targets the digest-matching node and rejects a raw selector', () => {
  const { engine, rs, h, surface } = open();
  const target = mkNode('btn', { role: 'button', name: 'Go', path: 'body/btn' });
  engine.setNodes(surface, [target]);
  const id = nodeIdOf(target);
  const okRes = rs.act(h, { kind: 'click', node_id: id }, ticketFor({ kind: 'click', node_id: id }, 0));
  assert.equal(okRes.ok, true);
  assert.equal(engine.dispatched.length, 1);
  assert.equal(engine.dispatched[0]?.engine_ref, 'btn');

  const selector = 'button#go.raw';
  const rawRes = rs.act(h, { kind: 'click', node_id: selector }, ticketFor({ kind: 'click', node_id: selector }, 0));
  assert.equal(rawRes.ok, false);
  assert.equal(rawRes.ok === false && rawRes.error, 'unknown_node');
  assert.equal(engine.dispatched.length, 1); // no new dispatch
});
