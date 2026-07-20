// Op 10 — P2 page-handle-registry.
// mint returns a unique handle bound to a workspace; resolve of a closed handle
// returns not_found; set_epoch strictly increases and refuses a non-monotonic
// value; the workspace binding does not change after mint.

import test from 'node:test';
import assert from 'node:assert/strict';
import { NOT_FOUND, PageHandleRegistry } from '../src/registry.ts';

test('mint returns a unique handle bound to a workspace', () => {
  const r = new PageHandleRegistry();
  const a = r.mint('W1', 'persist:W1', 'surface#1');
  const b = r.mint('W1', 'persist:W1', 'surface#2');
  assert.notEqual(a.handle_id, b.handle_id);
  const rec = r.resolve(a);
  assert.notEqual(rec, NOT_FOUND);
  if (rec !== NOT_FOUND) {
    assert.equal(rec.workspace_id, 'W1');
    assert.equal(rec.nav_epoch, 0);
  }
});

test('resolve of a closed handle returns not_found', () => {
  const r = new PageHandleRegistry();
  const h = r.mint('W', 'persist:W', 's');
  r.close(h);
  assert.equal(r.resolve(h), NOT_FOUND);
  assert.equal(r.epoch(h), NOT_FOUND);
  assert.equal(r.setEpoch(h, 1), 'not_found');
});

test('resolve of an unknown handle returns not_found', () => {
  const r = new PageHandleRegistry();
  assert.equal(r.resolve({ handle_id: 'nope' }), NOT_FOUND);
});

test('set_epoch strictly increases and refuses non-monotonic values', () => {
  const r = new PageHandleRegistry();
  const h = r.mint('W', 'persist:W', 's');
  assert.equal(r.setEpoch(h, 1), 'ok');
  assert.equal(r.setEpoch(h, 2), 'ok');
  assert.equal(r.setEpoch(h, 2), 'non_monotonic');
  assert.equal(r.setEpoch(h, 1), 'non_monotonic');
  assert.equal(r.setEpoch(h, 0), 'non_monotonic');
  assert.equal(r.epoch(h), 2);
});

test('workspace binding is immutable after mint', () => {
  const r = new PageHandleRegistry();
  const h = r.mint('OWNER', 'persist:OWNER', 's');
  r.setEpoch(h, 5);
  const rec = r.resolve(h);
  assert.notEqual(rec, NOT_FOUND);
  if (rec !== NOT_FOUND) assert.equal(rec.workspace_id, 'OWNER');
});
