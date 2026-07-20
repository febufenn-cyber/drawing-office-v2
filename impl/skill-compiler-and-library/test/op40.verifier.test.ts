// Op 40 — P3 sandbox-verifier. A candidate reproducing expected outputs passes; a
// candidate whose provenance names the verifier role is refused
// VERIFIER_NOT_INDEPENDENT; every act lands on the sandbox partition and none on a
// production partition; a terminal monetary step is bound and resolved but never
// committed; a non-reproducing candidate fails.

import test from 'node:test';
import assert from 'node:assert/strict';
import { generalize } from '../src/generalizer.ts';
import { verify } from '../src/verifier.ts';
import { FakeModel, FakeSurface, FIXED_CLOCK, paymentNodes, paymentTrajectory, SANDBOX, searchNodes, searchTrajectory } from './helpers.ts';

function candidateFrom(trajectory: ReturnType<typeof searchTrajectory>, model: FakeModel) {
  const gen = generalize(trajectory, model, FIXED_CLOCK);
  if (!gen.ok) throw new Error('fixture did not generalize: ' + gen.reason);
  return gen.candidate;
}

test('a candidate reproducing expected outputs passes and acts only on the sandbox partition', () => {
  const model = new FakeModel();
  const surface = new FakeSurface(searchNodes());
  const res = verify(candidateFrom(searchTrajectory(), model), { query: 'held' }, { model, surface, sandboxPartition: SANDBOX });
  assert.equal(res.ok, true);
  assert.equal(surface.opens[0]?.partition, SANDBOX);
  assert.equal(surface.opens[0]?.sandbox, true);
  assert.ok(surface.acts.every((a) => a.partition === SANDBOX)); // none on production
});

test('a candidate whose provenance names the verifier role is refused, never graded', () => {
  const sameModel = new FakeModel({ generalizer: 'model-A', verifier: 'model-A' }); // no independence
  const candidate = candidateFrom(searchTrajectory(), sameModel);
  const surface = new FakeSurface(searchNodes());
  const res = verify(candidate, { query: 'held' }, { model: sameModel, surface, sandboxPartition: SANDBOX });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, 'VERIFIER_NOT_INDEPENDENT');
  assert.equal(sameModel.gradeCalls, 0); // refused before grading
  assert.equal(surface.acts.length, 0); // and before any sandbox action
});

test('a terminal monetary step is bound and resolved but never committed in the sandbox', () => {
  const model = new FakeModel();
  const surface = new FakeSurface(paymentNodes());
  const res = verify(candidateFrom(paymentTrajectory(), model), { query: 'held' }, { model, surface, sandboxPartition: SANDBOX });
  assert.equal(res.ok, true);
  // The type step acted; the terminal monetary submit did not (bound + resolved only).
  assert.deepEqual(surface.actedIds(), ['sb-amt']);
  assert.equal(surface.actedIds().includes('sb-pay'), false);
});

test('a non-reproducing candidate fails with OUTPUT_DIVERGED', () => {
  const model = new FakeModel({ generalizer: 'model-A', verifier: 'model-B' }, undefined, 'diverged');
  const surface = new FakeSurface(searchNodes());
  const res = verify(candidateFrom(searchTrajectory(), model), { query: 'held' }, { model, surface, sandboxPartition: SANDBOX });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, 'OUTPUT_DIVERGED');
});

test('a candidate whose locators do not bind fails LOCATOR_UNBOUND', () => {
  const model = new FakeModel();
  const surface = new FakeSurface([]); // sandbox snapshot has no matching nodes
  const res = verify(candidateFrom(searchTrajectory(), model), { query: 'held' }, { model, surface, sandboxPartition: SANDBOX });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, 'LOCATOR_UNBOUND');
});
