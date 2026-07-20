// Op 40 — P2 step-scheduler. ready_set equals predecessors-satisfied minus
// terminal on fixture graphs; order ascending by step_id; no step yielded before
// every predecessor holds a succeeded checkpoint; next returns none only on a
// complete or blocked graph.

import test from 'node:test';
import assert from 'node:assert/strict';
import { allTerminal, next, readySet } from '../src/scheduler.ts';
import { inputDigest } from '../src/schema.ts';
import { resolveInputs } from '../src/resolve.ts';
import { CheckpointStore } from '../src/checkpointStore.ts';
import type { Checkpoint, Step, TaskGraph } from '../src/types.ts';
import { FakeWorkspaceStore, linearGraph, WS } from './helpers.ts';

function succeed(store: CheckpointStore, graph: TaskGraph, step: Step, outputs: Record<string, unknown>): void {
  const digest = inputDigest(step, resolveInputs(graph, step, store));
  const cp: Checkpoint = { step_id: step.step_id, input_digest: digest, status: 'succeeded', outputs, attempt: 1, ts: '2026-07-20T00:00:00Z' };
  store.write(cp, true);
}

test('an empty run is ready only at the root step', () => {
  const g = linearGraph();
  const store = new CheckpointStore(new FakeWorkspaceStore(), WS);
  assert.deepEqual(readySet(g, store).map((s) => s.step_id), ['s1']);
});

test('a step becomes ready only after its predecessor succeeds with a materialized output', () => {
  const g = linearGraph();
  const store = new CheckpointStore(new FakeWorkspaceStore(), WS);
  succeed(store, g, g.steps[0]!, { page: 'p1' });
  assert.deepEqual(readySet(g, store).map((s) => s.step_id), ['s2']); // s1 honored, s2 ready
});

test('the ready set is ordered ascending by step_id', () => {
  const g = linearGraph();
  // Two independent roots plus the linear tail; both roots are ready at once.
  const g2: TaskGraph = { ...g, steps: [...g.steps, { ...g.steps[0]!, step_id: 's0', signature: 'sig-nav2' }] };
  const store = new CheckpointStore(new FakeWorkspaceStore(), WS);
  assert.deepEqual(readySet(g2, store).map((s) => s.step_id), ['s0', 's1']);
  assert.equal(next(g2, store)?.step_id, 's0');
});

test('a failed predecessor blocks its successors and next returns none', () => {
  const g = linearGraph();
  const store = new CheckpointStore(new FakeWorkspaceStore(), WS);
  store.write({ step_id: 's1', input_digest: inputDigest(g.steps[0]!, {}), status: 'failed', outputs: {}, attempt: 1, ts: '2026-07-20T00:00:00Z' }, true);
  assert.deepEqual(readySet(g, store), []);
  assert.equal(next(g, store), null);
  assert.equal(allTerminal(g, store), false); // s2..s5 hold no checkpoint
});

test('a stale succeeded checkpoint re-enters the ready set', () => {
  const g = linearGraph();
  const store = new CheckpointStore(new FakeWorkspaceStore(), WS);
  succeed(store, g, g.steps[0]!, { page: 'p1' });
  // s2 succeeded but under a digest that no longer matches its resolved input.
  store.write({ step_id: 's2', input_digest: 'stale', status: 'succeeded', outputs: { title: 'T' }, attempt: 1, ts: '2026-07-20T00:00:00Z' }, true);
  assert.ok(readySet(g, store).some((s) => s.step_id === 's2')); // re-runs
});

test('next returns none on a fully completed graph', () => {
  const g = linearGraph();
  const store = new CheckpointStore(new FakeWorkspaceStore(), WS);
  succeed(store, g, g.steps[0]!, { page: 'p1' });
  succeed(store, g, g.steps[1]!, { title: 'T' });
  succeed(store, g, g.steps[2]!, { verdict: 'yes' });
  succeed(store, g, g.steps[3]!, { done: true });
  succeed(store, g, g.steps[4]!, { ok: true });
  assert.equal(next(g, store), null);
  assert.equal(allTerminal(g, store), true);
});
