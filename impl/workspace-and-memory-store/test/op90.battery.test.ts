// Op 90 — isolation, encryption, and deletion battery.
// No store returns a row from another workspace; delete zeroizes the key and
// renders the partition unreadable; no partition file carries plaintext; no
// partition is reachable without an open handle.

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Disk } from '../src/disk.ts';
import { KeyProvisioner } from '../src/keyProvisioner.ts';
import { Partition } from '../src/partition.ts';
import { isRejection } from '../src/types.ts';
import { WorkspaceStore } from '../src/workspaceStore.ts';
import { budget, entity, episode, MASTER, now, scope, skill } from './helpers.ts';

function seed(s: WorkspaceStore, id: string, tag: string): void {
  const ep = s.episodic(id);
  const en = s.entity(id);
  const sk = s.skill(id);
  const bg = s.budget(id);
  if (isRejection(ep) || isRejection(en) || isRejection(sk) || isRejection(bg)) throw new Error('open failed');
  ep.append(episode('ep-' + tag, { task_ref: 'task-' + tag }));
  en.upsert(entity('en-' + tag, { label: 'label-' + tag }));
  sk.put(skill('sk-' + tag));
  bg.debit(100, 'USD', 'ref-' + tag);
}

test('no store returns a row from another workspace', () => {
  const disk = new Disk();
  const s = new WorkspaceStore(disk, new KeyProvisioner(MASTER), now);
  const a = s.create('a', scope(), budget());
  const b = s.create('b', scope(), budget());
  if (isRejection(a) || isRejection(b)) throw new Error('create failed');
  seed(s, a.workspace_id, 'A');
  seed(s, b.workspace_id, 'B');

  const ep = s.episodic(a.workspace_id);
  const en = s.entity(a.workspace_id);
  const sk = s.skill(a.workspace_id);
  if (isRejection(ep) || isRejection(en) || isRejection(sk)) throw new Error('open failed');
  assert.deepEqual(ep.query({}).map((x) => x.episode_id), ['ep-A']);
  assert.deepEqual(en.embeddings().map((x) => x.row_id), ['en-A']);
  assert.deepEqual(sk.list().map((x) => x.skill_id), ['sk-A']);
});

test('delete zeroizes the key and the partition becomes unreadable', () => {
  const disk = new Disk();
  const keys = new KeyProvisioner(MASTER);
  const s = new WorkspaceStore(disk, keys, now);
  const a = s.create('a', scope(), budget());
  if (isRejection(a)) throw new Error('create failed');
  seed(s, a.workspace_id, 'A');
  const partition_id = a.partition_id;

  s.delete(a.workspace_id);
  assert.equal(isRejection(s.episodic(a.workspace_id)), true); // no key -> no open

  // The ciphertext file survives, but a fresh (wrong) key cannot read it.
  const backend = disk.partitions.get(partition_id);
  assert.ok(backend);
  const wrong = new Partition(randomBytes(32), backend as NonNullable<typeof backend>);
  assert.equal(wrong.all('episodic').length, 0);
});

test('no partition file carries plaintext across any store', () => {
  const disk = new Disk();
  const s = new WorkspaceStore(disk, new KeyProvisioner(MASTER), now);
  const a = s.create('a', scope(), budget());
  if (isRejection(a)) throw new Error('create failed');
  seed(s, a.workspace_id, 'ZEBRA');
  for (const backend of disk.partitions.values()) {
    const raw = backend.rawBytes();
    assert.equal(raw.includes('ZEBRA'), false);
    assert.equal(raw.includes('label-ZEBRA'), false);
    assert.equal(raw.includes('task-ZEBRA'), false);
  }
});

test('a partition is not reachable without an open workspace handle', () => {
  const disk = new Disk();
  const s = new WorkspaceStore(disk, new KeyProvisioner(MASTER), now);
  assert.equal(isRejection(s.episodic('never-created')), true);
  assert.equal(isRejection(s.budget('never-created')), true);
});
