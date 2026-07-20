// Op 80 — ticket and epoch invalidation battery.
// Navigation, target mutation, ticket reuse, ticket expiry, digest mismatch, and
// epoch skew each cause act to reject and perform nothing; observe emits the new
// epoch on every committed navigation.

import test from 'node:test';
import assert from 'node:assert/strict';
import { RenderSurface } from '../src/renderSurface.ts';
import { StubEngine } from '../src/stubEngine.ts';
import { KEY, mkNode, nodeIdOf, now, PAST, secretResolver, ticketFor } from './helpers.ts';

function scene() {
  const engine = new StubEngine();
  const rs = new RenderSurface(engine, KEY, secretResolver, now);
  const opened = rs.open('https://site', { workspace_id: 'A', partition_key: 'A:main' });
  if (!opened.ok) throw new Error('open failed');
  const h = opened.value;
  const surface = engine.surfaceIds().at(-1) as string;
  const btn = mkNode('btn', { role: 'button', name: 'Go', path: 'body/btn' });
  engine.setNodes(surface, [btn]);
  return { engine, rs, h, surface, btn, id: nodeIdOf(btn) };
}

test('a ticket from before navigation is rejected (epoch skew) and dispatches nothing', () => {
  const { engine, rs, h, surface, id } = scene();
  const stale = ticketFor({ kind: 'click', node_id: id }, 0); // epoch 0
  engine.navigate(surface, 'https://site/2', [mkNode('btn2', { role: 'button', name: 'Go' })]);
  rs.observe(h); // epoch -> 1
  const res = rs.act(h, { kind: 'click', node_id: id }, stale);
  assert.equal(res.ok, false);
  assert.equal(engine.dispatched.length, 0);
});

test('a target mutation makes the node id unresolvable; act performs nothing', () => {
  const { engine, rs, h, surface, id } = scene();
  const ticket = ticketFor({ kind: 'click', node_id: id }, 0);
  engine.setNodes(surface, [mkNode('btn', { role: 'button', name: 'RENAMED', path: 'body/btn' })]);
  const res = rs.act(h, { kind: 'click', node_id: id }, ticket);
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.error, 'unknown_node');
  assert.equal(engine.dispatched.length, 0);
});

test('ticket reuse is rejected; the first act dispatches exactly once', () => {
  const { engine, rs, h, id } = scene();
  const ticket = ticketFor({ kind: 'click', node_id: id }, 0);
  assert.equal(rs.act(h, { kind: 'click', node_id: id }, ticket).ok, true);
  assert.equal(rs.act(h, { kind: 'click', node_id: id }, ticket).ok, false);
  assert.equal(engine.dispatched.length, 1);
});

test('an expired ticket is rejected and dispatches nothing', () => {
  const { engine, rs, h, id } = scene();
  const ticket = ticketFor({ kind: 'click', node_id: id }, 0, { expiry: PAST });
  assert.equal(rs.act(h, { kind: 'click', node_id: id }, ticket).ok, false);
  assert.equal(engine.dispatched.length, 0);
});

test('a digest-mismatched ticket is rejected and dispatches nothing', () => {
  const { engine, rs, h, id } = scene();
  const ticket = ticketFor({ kind: 'click', node_id: id, value: 'X' }, 0);
  const res = rs.act(h, { kind: 'click', node_id: id, value: 'Y' }, ticket);
  assert.equal(res.ok, false);
  assert.equal(engine.dispatched.length, 0);
});

test('an epoch-skewed ticket (ahead of the handle) is rejected', () => {
  const { engine, rs, h, id } = scene();
  const ticket = ticketFor({ kind: 'click', node_id: id }, 7); // handle is at epoch 0
  assert.equal(rs.act(h, { kind: 'click', node_id: id }, ticket).ok, false);
  assert.equal(engine.dispatched.length, 0);
});

test('observe emits the new epoch on every committed navigation', () => {
  const { engine, rs, h, surface } = scene();
  engine.navigate(surface, 'https://site/2', [mkNode('n2')]);
  engine.navigate(surface, 'https://site/3', [mkNode('n3')]);
  const evs = rs.observe(h);
  assert.equal(evs.ok, true);
  if (evs.ok) {
    const epochs = evs.value.filter((e) => e.kind === 'nav').map((e) => (e.kind === 'nav' ? e.nav_epoch : -1));
    assert.deepEqual(epochs, [1, 2]);
  }
});
