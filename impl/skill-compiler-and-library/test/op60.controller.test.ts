// Op 60 — P5 promotion-controller. A successful trajectory flows generalize then
// verify then promote and the skill becomes lookup-exact eligible; a candidate
// failing verification is not promoted; an identical resubmitted candidate promotes
// the existing version rather than forking; the promotion-controller is the only
// writer of status.

import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeModel, putSnapshot, searchNodes, searchTrajectory, wire } from './helpers.ts';

test('a successful trajectory generalizes, verifies, and promotes to lookup-exact eligible', () => {
  const w = wire();
  const res = w.controller.compile_and_verify(searchTrajectory());
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.version, 1);
  assert.equal(w.model.liftCalls, 1);
  assert.equal(w.model.gradeCalls, 1); // generalize once, verify once

  putSnapshot(w.ws, 'snap:cur', searchNodes());
  assert.equal(w.library.lookup_exact('shop.search', 'snap:cur')?.skill_id, res.skill_id);
});

test('a candidate failing verification is written as candidate but never promoted', () => {
  const w = wire({ model: new FakeModel({ generalizer: 'model-A', verifier: 'model-B' }, undefined, 'diverged') });
  const res = w.controller.compile_and_verify(searchTrajectory());
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, 'OUTPUT_DIVERGED');
  assert.equal(w.library.latest_promoted('shop.search'), null); // not promoted
  assert.equal(w.library.history('shop.search')[0]?.status, 'candidate'); // stays candidate
});

test('an identical resubmitted candidate promotes the existing version, not a fork', () => {
  const w = wire();
  const a = w.controller.compile_and_verify(searchTrajectory());
  const b = w.controller.compile_and_verify(searchTrajectory());
  assert.ok(a.ok && b.ok);
  if (a.ok && b.ok) assert.equal(a.version, b.version); // same digest -> same version
  assert.equal(w.library.history('shop.search').length, 1); // no duplicate fork
});

test('a shape-invalid trajectory does not reach verification', () => {
  // A model that lifts an unused parameter fails the generalizer post-check.
  const w = wire({ model: new FakeModel(undefined, () => ({ parameters: [{ name: 'query', type: 'string', required: true }, { name: 'ghost', type: 'string', required: false }], param_binding: { 0: 'query' } })) });
  const res = w.controller.compile_and_verify(searchTrajectory());
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, 'SHAPE_INVALID');
  assert.equal(w.model.gradeCalls, 0); // never verified
});
