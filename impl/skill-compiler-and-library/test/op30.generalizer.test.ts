// Op 30 — P2 trajectory-generalizer. A fixture trajectory compiles to a candidate;
// every varied value becomes exactly one typed parameter and every node id a
// locator; provenance names the source and generalizing model; the post-check
// rejects a candidate whose replay over the source inputs diverges from the source
// actions.

import test from 'node:test';
import assert from 'node:assert/strict';
import { generalize } from '../src/generalizer.ts';
import { FakeModel, FIXED_CLOCK, searchTrajectory } from './helpers.ts';
import type { LiftResult } from '../src/seams.ts';
import type { Trajectory } from '../src/types.ts';

test('a fixture trajectory compiles to a candidate with one model call', () => {
  const model = new FakeModel();
  const res = generalize(searchTrajectory(), model, FIXED_CLOCK);
  assert.equal(res.ok, true);
  assert.equal(model.liftCalls, 1); // exactly one generalizing pass
});

test('every varied value becomes exactly one typed parameter and node ids become locators', () => {
  const res = generalize(searchTrajectory(), new FakeModel(), FIXED_CLOCK);
  assert.ok(res.ok);
  if (!res.ok) return;
  const skill = res.candidate;
  assert.deepEqual(skill.parameters, [{ name: 'query', type: 'string', required: true }]);
  assert.equal(skill.steps[0]!.bindings[0]!.source, 'param:query');
  // Locators carry role / name / structural_path — never the concrete node id.
  assert.equal(skill.steps[0]!.locator.structural_path, 'form/input[0]');
  assert.equal(JSON.stringify(skill).includes('n-box'), false);
});

test('provenance names the source trajectory and the generalizing model identity', () => {
  const res = generalize(searchTrajectory(), new FakeModel(), FIXED_CLOCK);
  assert.ok(res.ok);
  if (!res.ok) return;
  assert.equal(res.candidate.provenance.trajectory_ref, 'traj-1');
  assert.equal(res.candidate.provenance.generalizing_model, 'model-A'); // router identity, not model text
  assert.ok(res.candidate.provenance.source_digest.length === 64);
});

test('the post-check rejects a candidate whose replay diverges from its source', () => {
  // source_inputs disagree with the recorded action value: the lift parameterized
  // the value, but re-binding to the source inputs no longer reproduces the action.
  const diverging: Trajectory = { ...searchTrajectory(), source_inputs: { query: 'something-else' } };
  const res = generalize(diverging, new FakeModel(), FIXED_CLOCK);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, 'SOURCE_DIVERGED');
});

test('a lift that declares an unused parameter is rejected as shape-invalid', () => {
  const orphanLift = (): LiftResult => ({
    parameters: [{ name: 'query', type: 'string', required: true }, { name: 'extra', type: 'string', required: false }],
    param_binding: { 0: 'query' }, // 'extra' is never bound by any step
  });
  const model = new FakeModel(undefined, orphanLift);
  const res = generalize(searchTrajectory(), model, FIXED_CLOCK);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, 'SHAPE_INVALID');
});

test('generalization is byte-identical for a fixed trajectory and model', () => {
  const a = generalize(searchTrajectory(), new FakeModel(), FIXED_CLOCK);
  const b = generalize(searchTrajectory(), new FakeModel(), FIXED_CLOCK);
  assert.ok(a.ok && b.ok);
  if (a.ok && b.ok) assert.equal(JSON.stringify(a.candidate), JSON.stringify(b.candidate));
});
