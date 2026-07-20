// Op 50 — P4 step-dispatcher. The ladder tries exact skill, then nearest-with-
// patch, then full model, first applicable winning; consequential steps call only
// the control-plane stub and the RenderSurface records zero act-class calls;
// perception steps call only snapshot; the verify postcondition is evaluated on
// every result.

import test from 'node:test';
import assert from 'node:assert/strict';
import { StepDispatcher } from '../src/dispatcher.ts';
import type { DispatchContext } from '../src/dispatcher.ts';
import type { Step } from '../src/types.ts';
import { FakeControlPlane, FakeModelRouter, FakeRenderSurface, FakeSkillLibrary, CONTROL_OUTPUTS, HANDLE, linearGraph, PERCEPTION_VALUES, SNAPSHOT_REF, WS } from './helpers.ts';

const CTX: DispatchContext = { workspace_id: WS, graph_id: 'g1', handle: HANDLE };
const G = linearGraph();
const s = (id: string): Step => G.steps.find((x) => x.step_id === id)!;

function dispatcher(exact = new Set<string>(), nearest = new Set<string>()): {
  d: StepDispatcher; control: FakeControlPlane; surface: FakeRenderSurface; model: FakeModelRouter;
} {
  const control = new FakeControlPlane(CONTROL_OUTPUTS);
  const surface = new FakeRenderSurface(PERCEPTION_VALUES);
  const model = new FakeModelRouter();
  const d = new StepDispatcher(new FakeSkillLibrary(exact, nearest), control, surface, model, SNAPSHOT_REF);
  return { d, control, surface, model };
}

test('the strategy ladder resolves exact, else nearest, else model — exact wins', () => {
  assert.equal(dispatcher(new Set(['sig-cmp']), new Set(['sig-cmp'])).d.dispatch(CTX, s('s3'), { title: 'X' }, 'k').strategy, 'exact');
  assert.equal(dispatcher(new Set(), new Set(['sig-cmp'])).d.dispatch(CTX, s('s3'), { title: 'X' }, 'k').strategy, 'patched');
  assert.equal(dispatcher(new Set(), new Set()).d.dispatch(CTX, s('s3'), { title: 'X' }, 'k').strategy, 'model');
});

test('a consequential step crosses only the control plane; RenderSurface records zero act calls', () => {
  const { d, control, surface } = dispatcher();
  const r = d.dispatch(CTX, s('s1'), {}, 'k'); // navigate
  assert.equal(r.boundary, 'control_plane');
  assert.equal(r.status, 'succeeded');
  assert.equal(control.countFor('s1'), 1);
  assert.equal(surface.acts, 0);
  assert.equal(surface.snapshots, 0);
});

test('a perception step reads a snapshot and never touches the control plane', () => {
  const { d, control, surface } = dispatcher();
  const r = d.dispatch(CTX, s('s2'), { page: 'p1' }, 'k'); // extract
  assert.equal(r.boundary, 'perception');
  assert.equal(r.status, 'succeeded');
  assert.deepEqual(r.outputs, { title: 'Widget' });
  assert.equal(surface.snapshots, 1);
  assert.equal(control.submissions.length, 0);
});

test('a compare step crosses the model router', () => {
  const { d, model } = dispatcher();
  const r = d.dispatch(CTX, s('s3'), { title: 'Widget' }, 'k');
  assert.equal(r.boundary, 'model');
  assert.equal(model.calls, 1);
  assert.equal(r.outputs['verdict'], 'yes');
});

test('the postcondition is evaluated on every result — a short output fails the step', () => {
  const { d } = dispatcher();
  const bad: Step = { ...s('s3'), postcondition: { op: 'present', port: 'absent' } };
  const r = d.dispatch(CTX, bad, { title: 'X' }, 'k');
  assert.equal(r.status, 'failed');
  assert.equal(r.detail, 'postcondition_failed');
});

test('a denied consequential proposal fails the step without an act call', () => {
  const control = new FakeControlPlane(CONTROL_OUTPUTS, new Set(['s4']));
  const surface = new FakeRenderSurface(PERCEPTION_VALUES);
  const d = new StepDispatcher(new FakeSkillLibrary(), control, surface, new FakeModelRouter(), SNAPSHOT_REF);
  const r = d.dispatch(CTX, s('s4'), { verdict: 'yes' }, 'k');
  assert.equal(r.status, 'failed');
  assert.equal(r.detail, 'denied');
  assert.equal(surface.acts, 0);
});
