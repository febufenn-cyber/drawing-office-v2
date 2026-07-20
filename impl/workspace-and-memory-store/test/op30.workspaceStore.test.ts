// Op 30 — P2 workspace-store.
// Create is atomic and durable; the full lifecycle runs; active and archived
// workspaces reload after a process restart; each workspace maps to exactly one
// partition id.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Disk } from '../src/disk.ts';
import { KeyProvisioner } from '../src/keyProvisioner.ts';
import { isRejection } from '../src/types.ts';
import { WorkspaceStore } from '../src/workspaceStore.ts';
import { budget, MASTER, now, scope } from './helpers.ts';

function fresh() {
  const disk = new Disk();
  const keys = new KeyProvisioner(MASTER);
  const store = new WorkspaceStore(disk, keys, now);
  return { disk, keys, store };
}

test('create returns an active workspace with a partition id', () => {
  const { store } = fresh();
  const w = store.create('goal one', scope(), budget());
  assert.equal(isRejection(w), false);
  if (!isRejection(w)) {
    assert.equal(w.state, 'active');
    assert.equal(w.partition_id, 'persist:ws-' + w.workspace_id);
  }
});

test('an invalid budget rejects and creates no catalog entry', () => {
  const { store } = fresh();
  const bad = { currency: 'USD', per_action_minor: 0, per_month_minor: 1 };
  const r = store.create('goal', scope(), bad);
  assert.equal(isRejection(r), true);
  assert.equal(store.list().length, 0);
});

test('the full lifecycle runs and a deleted workspace never reopens', () => {
  const { store } = fresh();
  const w = store.create('g', scope(), budget());
  assert.equal(isRejection(w), false);
  if (isRejection(w)) return;
  const id = w.workspace_id;
  assert.equal((store.archive(id) as { state: string }).state, 'archived');
  assert.equal((store.reopen(id) as { state: string }).state, 'active');
  assert.equal((store.delete(id) as { state: string }).state, 'deleted');
  assert.equal(isRejection(store.get(id)), true);
  assert.equal(isRejection(store.reopen(id)), true);
  assert.equal(store.list().length, 0);
});

test('distinct workspaces map to distinct partition ids', () => {
  const { store } = fresh();
  const a = store.create('a', scope(), budget());
  const b = store.create('b', scope(), budget());
  if (isRejection(a) || isRejection(b)) throw new Error('create failed');
  assert.notEqual(a.partition_id, b.partition_id);
});

test('active and archived workspaces reload after a process restart', () => {
  const { disk, keys, store } = fresh();
  const a = store.create('keep active', scope(), budget());
  const b = store.create('to archive', scope(), budget());
  if (isRejection(a) || isRejection(b)) throw new Error('create failed');
  store.archive(b.workspace_id);
  // Write an episode so we can prove partition data reopens too.
  const ep = store.episodic(a.workspace_id);
  if (isRejection(ep)) throw new Error('episodic failed');
  ep.append({
    episode_id: 'e1', task_ref: 't', started_at: '2026-07-20T00:00:00Z',
    ended_at: '2026-07-20T00:00:01Z', outcome: { status: 'succeeded', detail: '' },
    steps: [], embedding: [0, 0, 0, 0],
  });

  // "Restart": a new store over the same disk and keyring.
  const store2 = new WorkspaceStore(disk, keys, now);
  const ids = store2.list().map((w) => w.workspace_id).sort();
  assert.deepEqual(ids, [a.workspace_id, b.workspace_id].sort());
  const ep2 = store2.episodic(a.workspace_id);
  if (isRejection(ep2)) throw new Error('episodic reload failed');
  assert.equal(ep2.query({}).length, 1);
});
