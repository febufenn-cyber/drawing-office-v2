// Op 80 — determinism and independence battery. An identical trajectory with fixed
// models yields a byte-identical candidate skill; lookup_exact and lookup_nearest
// are deterministic for a fixed library version and snapshot; the resolved verifier
// identity always differs from the generalizer identity; the post-check reproduces
// source actions exactly.

import test from 'node:test';
import assert from 'node:assert/strict';
import { generalize } from '../src/generalizer.ts';
import { canonical } from '../src/canonical.ts';
import { FakeModel, FIXED_CLOCK, putSnapshot, searchNodes, searchTrajectory, wire } from './helpers.ts';

test('an identical trajectory with fixed models yields a byte-identical candidate', () => {
  const a = generalize(searchTrajectory(), new FakeModel(), FIXED_CLOCK);
  const b = generalize(searchTrajectory(), new FakeModel(), FIXED_CLOCK);
  assert.ok(a.ok && b.ok);
  if (a.ok && b.ok) {
    assert.equal(canonical(a.candidate), canonical(b.candidate));
    assert.equal(a.candidate.skill_id, b.candidate.skill_id);
  }
});

test('lookup_exact and lookup_nearest are deterministic for a fixed library and snapshot', () => {
  const w = wire();
  w.controller.compile_and_verify(searchTrajectory());
  putSnapshot(w.ws, 'snap:cur', searchNodes());
  assert.equal(canonical(w.library.lookup_exact('shop.search', 'snap:cur')), canonical(w.library.lookup_exact('shop.search', 'snap:cur')));
  assert.equal(canonical(w.library.lookup_nearest('shop.search', 'snap:cur')), canonical(w.library.lookup_nearest('shop.search', 'snap:cur')));
});

test('the verifier identity always differs from the generalizer identity in the independent case', () => {
  const model = new FakeModel({ generalizer: 'model-A', verifier: 'model-B' });
  assert.notEqual(model.identity('generalizer'), model.identity('verifier'));
  const w = wire({ model });
  const res = w.controller.compile_and_verify(searchTrajectory());
  assert.equal(res.ok, true); // graded, not refused
  assert.equal(model.gradeCalls, 1);
});

test('a router returning the same identity for both roles fails the independence check', () => {
  const model = new FakeModel({ generalizer: 'model-A', verifier: 'model-A' });
  const w = wire({ model });
  const res = w.controller.compile_and_verify(searchTrajectory());
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, 'VERIFIER_NOT_INDEPENDENT');
});

test('the post-check reproduces the source action kinds exactly', () => {
  const res = generalize(searchTrajectory(), new FakeModel(), FIXED_CLOCK);
  assert.ok(res.ok);
  if (!res.ok) return;
  assert.deepEqual(res.candidate.steps.map((s) => s.kind), searchTrajectory().actions.map((a) => a.kind));
});
