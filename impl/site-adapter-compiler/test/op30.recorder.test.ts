// Op 30 — P2 exploration-recorder. One exploration yields exactly one Trajectory;
// every step carries pre and post snapshot refs and a stable anchor; a target with
// no structural digest is rejected as unstable_target; the recorded trajectory
// replays through P1 to the same result.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ExplorationRecorder, explore } from '../src/recorder.ts';
import { synthesize } from '../src/synthesizer.ts';
import { replay } from '../src/contract.ts';
import { AdapterStore } from '../src/store.ts';
import { canonical } from '../src/canonical.ts';
import { FakePage, FakeSurface, FIXED_CLOCK, HANDLE, ORIGIN, searchModel, SEARCH_SCRIPT, shopNodes } from './helpers.ts';

test('one exploration yields exactly one trajectory with a stable anchor per step', () => {
  const traj = explore(new FakeSurface(), new FakePage(shopNodes()), FIXED_CLOCK, ORIGIN, HANDLE, SEARCH_SCRIPT);
  assert.equal(traj.origin, ORIGIN);
  assert.equal(traj.steps.length, 3);
  for (const s of traj.steps) {
    assert.ok(s.anchor.structural_digest.length > 0);
    assert.ok(s.pre_ref.length > 0);
    assert.ok(s.post_ref.length > 0);
  }
});

test('every anchor resolves to a PageGraph stable node; no raw selector is recorded', () => {
  const traj = explore(new FakeSurface(), new FakePage(shopNodes()), FIXED_CLOCK, ORIGIN, HANDLE, SEARCH_SCRIPT);
  const digests = new Set(shopNodes().map((n) => n.structural_digest));
  for (const s of traj.steps) assert.equal(digests.has(s.anchor.structural_digest), true);
});

test('a target with no structural digest in the snapshot is rejected as unstable_target', () => {
  const rec = new ExplorationRecorder(new FakeSurface(), new FakePage(shopNodes()), FIXED_CLOCK);
  const res = rec.record_step(HANDLE, { role: 'button', name: 'Ghost', structural_digest: 'd-absent', stable_id: 'n-ghost' }, 'click', 'x', null, false, []);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error, 'unstable_target');
  assert.equal(rec.trajectory(ORIGIN).steps.length, 0); // recorded nothing
});

test('the recorded exploration drove the surface only by stable node id', () => {
  const surface = new FakeSurface();
  explore(surface, new FakePage(shopNodes()), FIXED_CLOCK, ORIGIN, HANDLE, SEARCH_SCRIPT);
  // type and click acted; the read step did not cross the surface.
  assert.deepEqual(surface.acts.map((a) => a.stable_id), ['n-search', 'n-submit']);
});

test('the recorded trajectory replays through P1 to the same result', () => {
  const traj = explore(new FakeSurface(), new FakePage(shopNodes()), FIXED_CLOCK, ORIGIN, HANDLE, SEARCH_SCRIPT);
  const store = new AdapterStore();
  const { adapter } = synthesize(traj, searchModel(), store, FIXED_CLOCK);
  const r = replay(adapter, adapter.tools[0]!, { query: 'widget' }, new FakeSurface(), new FakePage(shopNodes()), HANDLE);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, [{ title: 'Widget', price: '9.99' }]);
});

test('identical explorations are byte-identical', () => {
  const a = explore(new FakeSurface(), new FakePage(shopNodes()), FIXED_CLOCK, ORIGIN, HANDLE, SEARCH_SCRIPT);
  const b = explore(new FakeSurface(), new FakePage(shopNodes()), FIXED_CLOCK, ORIGIN, HANDLE, SEARCH_SCRIPT);
  assert.equal(canonical(a), canonical(b));
  assert.equal(a.trajectory_id, b.trajectory_id);
});
