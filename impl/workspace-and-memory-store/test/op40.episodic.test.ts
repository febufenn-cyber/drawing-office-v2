// Op 40 — P4 episodic-store.
// Round-trip preserves step ordinal order; the on-disk file carries no plaintext
// field; a query returns only the opened workspace's episodes.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Disk } from '../src/disk.ts';
import { KeyProvisioner } from '../src/keyProvisioner.ts';
import { isRejection } from '../src/types.ts';
import { WorkspaceStore } from '../src/workspaceStore.ts';
import { budget, episode, MASTER, now, scope } from './helpers.ts';

function store() {
  const disk = new Disk();
  return { disk, store: new WorkspaceStore(disk, new KeyProvisioner(MASTER), now) };
}

test('steps read back in ascending ordinal regardless of write order', () => {
  const { store: s } = store();
  const w = s.create('g', scope(), budget());
  if (isRejection(w)) throw new Error('create failed');
  const ep = s.episodic(w.workspace_id);
  if (isRejection(ep)) throw new Error('episodic failed');
  ep.append(episode('e1', {
    steps: [
      { ordinal: 2, action_digest: 'd2', observation_ref: 'o2' },
      { ordinal: 0, action_digest: 'd0', observation_ref: 'o0' },
      { ordinal: 1, action_digest: 'd1', observation_ref: 'o1' },
    ],
  }));
  const got = ep.query({ task_ref: 'task-1' });
  assert.equal(got.length, 1);
  assert.deepEqual(got[0]?.steps.map((x) => x.ordinal), [0, 1, 2]);
});

test('the on-disk partition carries no plaintext field', () => {
  const { disk, store: s } = store();
  const w = s.create('g', scope(), budget());
  if (isRejection(w)) throw new Error('create failed');
  const ep = s.episodic(w.workspace_id);
  if (isRejection(ep)) throw new Error('episodic failed');
  ep.append(episode('EPISODE-DISTINCTIVE', { task_ref: 'TASKREF-DISTINCTIVE' }));
  const raw = disk.partitions.get(w.partition_id)?.rawBytes() ?? '';
  assert.equal(raw.length > 0, true);
  assert.equal(raw.includes('EPISODE-DISTINCTIVE'), false);
  assert.equal(raw.includes('TASKREF-DISTINCTIVE'), false);
  assert.equal(raw.includes('obs0'), false);
});

test('a query returns only the opened workspace episodes', () => {
  const { store: s } = store();
  const a = s.create('a', scope(), budget());
  const b = s.create('b', scope(), budget());
  if (isRejection(a) || isRejection(b)) throw new Error('create failed');
  const epA = s.episodic(a.workspace_id);
  const epB = s.episodic(b.workspace_id);
  if (isRejection(epA) || isRejection(epB)) throw new Error('episodic failed');
  epA.append(episode('a-1'));
  epB.append(episode('b-1'));
  const got = epA.query({});
  assert.equal(got.length, 1);
  assert.equal(got[0]?.episode_id, 'a-1');
});

test('a query filters by task_ref, outcome, and time window', () => {
  const { store: s } = store();
  const w = s.create('g', scope(), budget());
  if (isRejection(w)) throw new Error('create failed');
  const ep = s.episodic(w.workspace_id);
  if (isRejection(ep)) throw new Error('episodic failed');
  ep.append(episode('e1', { task_ref: 'alpha', outcome: { status: 'succeeded', detail: '' }, started_at: '2026-07-20T00:00:00Z' }));
  ep.append(episode('e2', { task_ref: 'beta', outcome: { status: 'failed', detail: '' }, started_at: '2026-07-21T00:00:00Z' }));
  assert.equal(ep.query({ task_ref: 'alpha' }).length, 1);
  assert.equal(ep.query({ outcome: 'failed' }).length, 1);
  assert.equal(ep.query({ from: '2026-07-20T12:00:00Z' }).length, 1);
});
