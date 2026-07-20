// Op 90 — adversarial secret and ticket battery.
// A scripted hostile caller cannot read a secret byte across returns, snapshots,
// or events; forged and expired tickets never execute; masked fields never expose
// a filled value; the session key never surfaces above L0.

import test from 'node:test';
import assert from 'node:assert/strict';
import { RenderSurface } from '../src/renderSurface.ts';
import { StubEngine } from '../src/stubEngine.ts';
import type { ExecutionTicket, SecretRef } from '../src/types.ts';
import { KEY, mkNode, nodeIdOf, now, secretResolver, SECRET_VALUE, ticketFor } from './helpers.ts';

function armed() {
  const engine = new StubEngine();
  const rs = new RenderSurface(engine, KEY, secretResolver, now);
  const opened = rs.open('https://site', { workspace_id: 'A', partition_key: 'A:main' });
  if (!opened.ok) throw new Error('open failed');
  const h = opened.value;
  const surface = engine.surfaceIds().at(-1) as string;
  const pw = mkNode('pw', { role: 'textbox', name: 'password', path: 'body/pw' });
  engine.setNodes(surface, [pw]);
  return { engine, rs, h, surface, pwId: nodeIdOf(pw) };
}

test('no observable channel exposes the secret after a fill', () => {
  const { rs, h, pwId } = armed();
  const ref: SecretRef = { ref: 'vault://pw', scope: 'https://site' };
  rs.fillSecret(h, pwId, ref, ticketFor({ kind: 'fill_secret', node_id: pwId }, 0));
  // Hostile caller sweeps every above-L0 channel it has.
  const channels: unknown[] = [rs.snapshot(h), rs.screenshot(h, true), rs.observe(h)];
  for (const c of channels) {
    assert.equal(JSON.stringify(c).includes(SECRET_VALUE), false);
  }
});

test('a masked field stays masked across repeated snapshots', () => {
  const { rs, h, pwId } = armed();
  rs.fillSecret(h, pwId, { ref: 'vault://pw', scope: 'https://site' }, ticketFor({ kind: 'fill_secret', node_id: pwId }, 0));
  for (let i = 0; i < 5; i++) {
    const s = rs.snapshot(h);
    assert.equal(s.ok, true);
    if (s.ok) {
      const node = s.value.nodes.find((n) => n.node_id === pwId);
      assert.equal(node?.masked, true);
      assert.equal(node?.value, null);
    }
  }
});

test('forged and expired tickets never execute', () => {
  const { engine, rs, h, pwId } = armed();
  const forged: ExecutionTicket = {
    ticket_id: 'x',
    action_digest: 'ab'.repeat(32),
    nav_epoch: 0,
    expiry: '2999-01-01T00:00:00Z',
    mac: 'cd'.repeat(32),
  };
  assert.equal(rs.act(h, { kind: 'click', node_id: pwId }, forged).ok, false);
  const expired = ticketFor({ kind: 'click', node_id: pwId }, 0, { expiry: '2000-01-01T00:00:00Z' });
  assert.equal(rs.act(h, { kind: 'click', node_id: pwId }, expired).ok, false);
  assert.equal(engine.dispatched.length, 0);
});

test('the session key never surfaces above L0', () => {
  const { rs, h, pwId } = armed();
  rs.fillSecret(h, pwId, { ref: 'vault://pw', scope: 'https://site' }, ticketFor({ kind: 'fill_secret', node_id: pwId }, 0));
  const keyHex = KEY.toString('hex');
  const outputs = [
    rs.snapshot(h),
    rs.screenshot(h, true),
    rs.observe(h),
    rs.act(h, { kind: 'click', node_id: pwId }, ticketFor({ kind: 'click', node_id: pwId }, 0)),
  ];
  for (const o of outputs) {
    assert.equal(JSON.stringify(o).includes(keyHex), false);
  }
  // Enumerating the instance's own properties must not reveal the key either.
  assert.equal(JSON.stringify(Object.keys(rs)).includes(keyHex), false);
});
