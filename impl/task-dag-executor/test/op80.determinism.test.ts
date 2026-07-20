// Op 80 — determinism and replay-equivalence battery. Identical graph and
// checkpoint state yield an identical schedule and event sequence; replay
// reproduces the recorded event sequence exactly; no model or skill call occurs
// during replay (the replay function takes only the log — it cannot call a stub).

import test from 'node:test';
import assert from 'node:assert/strict';
import { replay } from '../src/controller.ts';
import { readySet } from '../src/scheduler.ts';
import { CheckpointStore } from '../src/checkpointStore.ts';
import { canonical } from '../src/canonical.ts';
import { FakeWorkspaceStore, HANDLE, linearGraph, wire, WS } from './helpers.ts';

const REQ = { workspace_id: WS, handle: HANDLE };

test('two independent runs of the same graph produce byte-identical logs', () => {
  const a = wire();
  const b = wire();
  a.controller.run(linearGraph(), REQ);
  b.controller.run(linearGraph(), REQ);
  assert.equal(canonical(a.log.readAll()), canonical(b.log.readAll()));
});

test('two independent runs produce byte-identical checkpoints per step', () => {
  const a = wire();
  const b = wire();
  a.controller.run(linearGraph(), REQ);
  b.controller.run(linearGraph(), REQ);
  for (const id of ['s1', 's2', 's3', 's4', 's5']) {
    assert.equal(canonical(a.checkpoints.latest(id)), canonical(b.checkpoints.latest(id)));
  }
});

test('replay reproduces the recorded event sequence exactly', () => {
  const w = wire();
  w.controller.run(linearGraph(), REQ);
  const entries = w.log.readAll();
  const state = replay(entries);
  assert.equal(canonical(state.events), canonical(entries)); // order and content preserved
  assert.deepEqual(state.steps.map((s) => s.step_id), ['s1', 's2', 's3', 's4', 's5']);
  assert.ok(state.steps.every((s) => s.status === 'succeeded'));
});

test('replay is a pure function of the log — identical across repeated calls', () => {
  const w = wire();
  w.controller.run(linearGraph(), REQ);
  const entries = w.log.readAll();
  assert.equal(canonical(replay(entries)), canonical(replay(entries)));
});

test('the schedule is deterministic for identical checkpoint state', () => {
  const g = linearGraph();
  const s1 = readySet(g, new CheckpointStore(new FakeWorkspaceStore(), WS));
  const s2 = readySet(g, new CheckpointStore(new FakeWorkspaceStore(), WS));
  assert.deepEqual(s1.map((s) => s.step_id), s2.map((s) => s.step_id));
});

test('replay of a resumed run still reconstructs the full sequence', () => {
  const ws = new FakeWorkspaceStore();
  wire({ ws }).controller.run(linearGraph(), REQ);
  const resumed = wire({ ws });
  resumed.controller.run(linearGraph(), REQ); // no-op resume, appends run.resumed + skips
  const state = resumed.controller.replay();
  assert.ok(state.steps.every((s) => s.status === 'succeeded' || s.status === 'skipped'));
});
