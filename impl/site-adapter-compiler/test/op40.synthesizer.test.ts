// Op 40 — P3 adapter-synthesizer. One learning pass per compilation; anchors and
// literals bound from the trajectory, never from model text; a proposed step whose
// anchor is absent from the trajectory is dropped; every param traces to a
// trajectory literal; the return schema covers every read field; every step
// carries a ProvenanceRef; identical trajectory and model response yield a
// byte-identical adapter.

import test from 'node:test';
import assert from 'node:assert/strict';
import { explore } from '../src/recorder.ts';
import { synthesize } from '../src/synthesizer.ts';
import { provenance } from '../src/contract.ts';
import { AdapterStore } from '../src/store.ts';
import { canonical } from '../src/canonical.ts';
import { FakeModel, FakePage, FakeSurface, FIXED_CLOCK, HANDLE, ORIGIN, searchModel, SEARCH_SCRIPT, shopNodes } from './helpers.ts';
import type { LearnResult } from '../src/seams.ts';
import type { Trajectory } from '../src/types.ts';

function trajectory(): Trajectory {
  return explore(new FakeSurface(), new FakePage(shopNodes()), FIXED_CLOCK, ORIGIN, HANDLE, SEARCH_SCRIPT);
}

test('exactly one learning pass per compilation', () => {
  const model = searchModel();
  synthesize(trajectory(), model, new AdapterStore(), FIXED_CLOCK);
  assert.equal(model.calls, 1);
});

test('anchors and literals are bound from the trajectory, and every step carries provenance', () => {
  const traj = trajectory();
  const { adapter } = synthesize(traj, searchModel(), new AdapterStore(), FIXED_CLOCK);
  const tool = adapter.tools[0]!;
  assert.equal(tool.steps.length, 3);
  for (const [i, s] of tool.steps.entries()) {
    assert.equal(s.anchor.structural_digest, traj.steps[i]!.anchor.structural_digest); // verbatim from trajectory
    assert.equal(s.provenance.trajectory_id, traj.trajectory_id);
    assert.equal(s.provenance.step_index, i);
  }
  // The type step is a param binding; the click step is a fixed (null) literal.
  assert.equal(tool.steps[0]!.binding.kind, 'param');
  assert.equal(tool.steps[0]!.binding.param_ref, 'query');
  assert.equal(tool.steps[1]!.binding.kind, 'literal');
});

test('every param traces to one trajectory literal; golden params carry the recorded value', () => {
  const { adapter } = synthesize(trajectory(), searchModel(), new AdapterStore(), FIXED_CLOCK);
  const tool = adapter.tools[0]!;
  assert.deepEqual(tool.params_schema, { kind: 'record', fields: { query: 'string' } });
  assert.deepEqual(tool.golden_params, { query: 'widget' });
});

test('the return schema covers every recorded read field', () => {
  const { adapter } = synthesize(trajectory(), searchModel(), new AdapterStore(), FIXED_CLOCK);
  const tool = adapter.tools[0]!;
  assert.deepEqual(tool.return_schema, { kind: 'list', fields: { title: 'string', price: 'string' } });
});

test('a proposed step whose anchor is absent from the trajectory is dropped, not guessed', () => {
  const traj = trajectory();
  const model = new FakeModel((): LearnResult => ({
    tools: [{
      name: 'search_products', kind: 'search',
      step_seqs: [0, 1, 2, 99], // seq 99 is not in the trajectory
      param_names: { 0: 'query' },
      return_fields: { title: 'string', price: 'string' },
    }],
  }));
  const { adapter } = synthesize(traj, model, new AdapterStore(), FIXED_CLOCK);
  assert.equal(adapter.tools[0]!.steps.length, 3); // the phantom step dropped
});

test('provenance resolves for every step of every tool', () => {
  const { adapter } = synthesize(trajectory(), searchModel(), new AdapterStore(), FIXED_CLOCK);
  const prov = provenance(adapter, 'search_products');
  assert.ok(prov);
  assert.equal(prov!.length, 3);
  for (const p of prov!) assert.ok(p.trajectory_id.length > 0);
});

test('synthesis is byte-identical for a fixed trajectory and model response', () => {
  const traj = trajectory();
  const a = synthesize(traj, searchModel(), new AdapterStore(), FIXED_CLOCK).adapter;
  const b = synthesize(traj, searchModel(), new AdapterStore(), FIXED_CLOCK).adapter;
  assert.equal(canonical({ ...a, version: 0 }), canonical({ ...b, version: 0 }));
  assert.equal(a.replay_digest, b.replay_digest);
  assert.equal(a.adapter_id, b.adapter_id);
});
