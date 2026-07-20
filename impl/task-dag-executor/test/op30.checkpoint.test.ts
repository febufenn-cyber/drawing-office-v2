// Op 30 — P3 checkpoint-store. latest returns the most recent checkpoint per step;
// a checkpoint whose input_digest differs from the resolved digest is not honored;
// a durable write returns only after flush; state survives restart.

import test from 'node:test';
import assert from 'node:assert/strict';
import { CheckpointStore } from '../src/checkpointStore.ts';
import { inputDigest } from '../src/schema.ts';
import type { Checkpoint } from '../src/types.ts';
import { FakeWorkspaceStore, linearGraph, WS } from './helpers.ts';

function cp(step_id: string, input_digest: string, outputs: Record<string, unknown>): Checkpoint {
  return { step_id, input_digest, status: 'succeeded', outputs, attempt: 1, ts: '2026-07-20T00:00:00Z' };
}

test('latest returns the most recent checkpoint per step_id', () => {
  const store = new CheckpointStore(new FakeWorkspaceStore(), WS);
  store.write(cp('s1', 'd1', { page: 'p1' }), true);
  store.write({ ...cp('s1', 'd2', { page: 'p2' }), attempt: 2 }, true);
  assert.equal(store.latest('s1')?.outputs['page'], 'p2');
  assert.equal(store.latest('s1')?.attempt, 2);
});

test('a durable write flushes before ack', () => {
  const ws = new FakeWorkspaceStore();
  const store = new CheckpointStore(ws, WS);
  store.write(cp('s1', 'd1', {}), true);
  assert.equal(ws.flushes, 1);
});

test('checkpoint state survives a restart', () => {
  const ws = new FakeWorkspaceStore();
  new CheckpointStore(ws, WS).write(cp('s1', 'd1', { page: 'p1' }), true);
  const restarted = new CheckpointStore(ws, WS); // fresh cache, same storage
  assert.equal(restarted.latest('s1')?.outputs['page'], 'p1');
});

test('a checkpoint is honored only when its input_digest matches the resolved digest', () => {
  const store = new CheckpointStore(new FakeWorkspaceStore(), WS);
  const compareStep = linearGraph().steps[2]!; // resolves input `title`
  const good = inputDigest(compareStep, { title: 'X' });
  store.write(cp('s3', good, { verdict: 'yes' }), true);
  assert.equal(store.honored(compareStep, { title: 'X' }), true); // digest matches
  assert.equal(store.honored(compareStep, { title: 'Z' }), false); // upstream changed
});

test('a non-succeeded checkpoint is never honored', () => {
  const store = new CheckpointStore(new FakeWorkspaceStore(), WS);
  const compareStep = linearGraph().steps[2]!;
  const d = inputDigest(compareStep, { title: 'X' });
  store.write({ ...cp('s3', d, {}), status: 'failed' }, true);
  assert.equal(store.honored(compareStep, { title: 'X' }), false);
});
