// Op 30 — P6 secret-fill-channel.
// fill streams to the surface and returns only a boolean; the secret value
// appears in no return, log, event, or masked snapshot; the mask registry records
// the node and masks it until navigation clears the field.

import test from 'node:test';
import assert from 'node:assert/strict';
import { RenderSurface } from '../src/renderSurface.ts';
import { StubEngine } from '../src/stubEngine.ts';
import type { SecretRef } from '../src/types.ts';
import { KEY, mkNode, nodeIdOf, now, secretResolver, SECRET_VALUE, ticketFor } from './helpers.ts';

function openWithField() {
  const engine = new StubEngine();
  const rs = new RenderSurface(engine, KEY, secretResolver, now);
  const opened = rs.open('https://site', { workspace_id: 'W', partition_key: 'W:main' });
  assert.equal(opened.ok, true);
  const h = opened.ok ? opened.value : (() => { throw new Error('unreachable'); })();
  const surface = engine.surfaceIds().at(-1);
  assert.ok(surface);
  const pw = mkNode('pw', { role: 'textbox', name: 'password', path: 'body/form/pw' });
  engine.setNodes(surface as string, [pw]);
  return { engine, rs, h, pwId: nodeIdOf(pw), surface: surface as string };
}

test('fill returns only a boolean and streams to the surface', () => {
  const { engine, rs, h, pwId } = openWithField();
  const ref: SecretRef = { ref: 'vault://pw', scope: 'https://site' };
  const ticket = ticketFor({ kind: 'fill_secret', node_id: pwId }, 0);
  const res = rs.fillSecret(h, pwId, ref, ticket);
  assert.equal(res.ok, true);
  assert.equal(res.ok && res.value, true);
  assert.equal(engine.streamedSecrets.length, 1);
});

test('the secret value appears in no snapshot after fill', () => {
  const { rs, h, pwId } = openWithField();
  const ref: SecretRef = { ref: 'vault://pw', scope: 'https://site' };
  rs.fillSecret(h, pwId, ref, ticketFor({ kind: 'fill_secret', node_id: pwId }, 0));
  const snap = rs.snapshot(h);
  assert.equal(snap.ok, true);
  if (snap.ok) {
    const node = snap.value.nodes.find((n) => n.node_id === pwId);
    assert.ok(node);
    assert.equal(node?.masked, true);
    assert.equal(node?.value, null);
    assert.equal(JSON.stringify(snap.value).includes(SECRET_VALUE), false);
  }
});

test('an out-of-scope secret_ref fills nothing and returns false', () => {
  const { engine, rs, h, pwId } = openWithField();
  const ref: SecretRef = { ref: 'vault://other', scope: 'https://site' };
  const res = rs.fillSecret(h, pwId, ref, ticketFor({ kind: 'fill_secret', node_id: pwId }, 0));
  assert.equal(res.ok, true);
  assert.equal(res.ok && res.value, false);
  assert.equal(engine.streamedSecrets.length, 0);
});

test('a masked field is cleared by a committed navigation', () => {
  const { engine, rs, h, pwId, surface } = openWithField();
  rs.fillSecret(h, pwId, { ref: 'vault://pw', scope: 'https://site' }, ticketFor({ kind: 'fill_secret', node_id: pwId }, 0));
  const fresh = mkNode('pw2', { role: 'textbox', name: 'password', path: 'body/form/pw2' });
  engine.navigate(surface, 'https://site/next', [fresh]);
  rs.observe(h); // pumps the nav event, bumps epoch, clears masks
  const snap = rs.snapshot(h);
  assert.equal(snap.ok, true);
  if (snap.ok) {
    const node = snap.value.nodes.find((n) => n.node_id === nodeIdOf(fresh));
    assert.ok(node);
    assert.equal(node?.masked, false);
  }
});
