// Op 70 — P1 render-surface-contract.
// The six operations dispatch to their parts; open establishes the per-session
// ticket key with the gate (a ticket minted under the shared key executes); open
// refuses a ctx without a workspace-scoped key; act with no valid ticket performs
// nothing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { RenderSurface } from '../src/renderSurface.ts';
import { StubEngine } from '../src/stubEngine.ts';
import type { ExecutionTicket } from '../src/types.ts';
import { KEY, mkNode, nodeIdOf, now, secretResolver, ticketFor } from './helpers.ts';

test('open refuses a ctx without a workspace-scoped key or an empty workspace', () => {
  const rs = new RenderSurface(new StubEngine(), KEY, secretResolver, now);
  assert.equal(rs.open('https://s', { workspace_id: 'A', partition_key: 'other:x' }).ok, false);
  assert.equal(rs.open('https://s', { workspace_id: '', partition_key: ':x' }).ok, false);
  assert.equal(rs.open('https://s', { workspace_id: 'A', partition_key: '' }).ok, false);
  assert.equal(rs.open('https://s', { workspace_id: 'A', partition_key: 'A:x' }).ok, true);
});

test('the six operations dispatch to their parts', () => {
  const engine = new StubEngine();
  const rs = new RenderSurface(engine, KEY, secretResolver, now);
  const opened = rs.open('https://site', { workspace_id: 'A', partition_key: 'A:main' });
  assert.equal(opened.ok, true);
  if (!opened.ok) return;
  const h = opened.value;
  const surface = engine.surfaceIds().at(-1) as string;
  const btn = mkNode('btn', { role: 'button', name: 'Go' });
  engine.setNodes(surface, [btn]);
  const id = nodeIdOf(btn);

  assert.equal(rs.snapshot(h).ok, true);
  assert.equal(rs.screenshot(h, true).ok, true);
  assert.equal(rs.observe(h).ok, true);
  assert.equal(rs.act(h, { kind: 'click', node_id: id }, ticketFor({ kind: 'click', node_id: id }, 0)).ok, true);
  assert.equal(engine.dispatched.length, 1);
});

test('act with no valid ticket performs nothing', () => {
  const engine = new StubEngine();
  const rs = new RenderSurface(engine, KEY, secretResolver, now);
  const opened = rs.open('https://site', { workspace_id: 'A', partition_key: 'A:main' });
  assert.equal(opened.ok, true);
  if (!opened.ok) return;
  const h = opened.value;
  const surface = engine.surfaceIds().at(-1) as string;
  const btn = mkNode('btn', { role: 'button', name: 'Go' });
  engine.setNodes(surface, [btn]);
  const id = nodeIdOf(btn);
  const forged: ExecutionTicket = {
    ticket_id: 'forged',
    action_digest: '00'.repeat(32),
    nav_epoch: 0,
    expiry: '2999-01-01T00:00:00Z',
    mac: '00'.repeat(32),
  };
  const res = rs.act(h, { kind: 'click', node_id: id }, forged);
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.error, 'ticket_rejected');
  assert.equal(engine.dispatched.length, 0);
});

test('operations on a closed handle return not_found', () => {
  const engine = new StubEngine();
  const rs = new RenderSurface(engine, KEY, secretResolver, now);
  const opened = rs.open('https://site', { workspace_id: 'A', partition_key: 'A:main' });
  assert.equal(opened.ok, true);
  if (!opened.ok) return;
  const h = opened.value;
  rs.close(h);
  assert.equal(rs.snapshot(h).ok, false);
  assert.equal(rs.screenshot(h, false).ok, false);
  assert.equal(rs.observe(h).ok, false);
});
