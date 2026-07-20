// Op 60 — P6 skill-store.
// Put advances the head and leaves prior versions immutable; get returns the
// highest promoted version; a demoted head is not served as current; records are
// ciphertext at rest.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Disk } from '../src/disk.ts';
import { KeyProvisioner } from '../src/keyProvisioner.ts';
import { isRejection } from '../src/types.ts';
import { WorkspaceStore } from '../src/workspaceStore.ts';
import { budget, MASTER, now, scope, skill } from './helpers.ts';

function open() {
  const disk = new Disk();
  const s = new WorkspaceStore(disk, new KeyProvisioner(MASTER), now);
  const w = s.create('g', scope(), budget());
  if (isRejection(w)) throw new Error('create failed');
  const store = s.skill(w.workspace_id);
  if (isRejection(store)) throw new Error('skill failed');
  return { disk, store, partition_id: w.partition_id };
}

test('put advances the head; get returns the highest promoted version', () => {
  const { store } = open();
  const v1 = store.put(skill('price-compare'));
  const v2 = store.put(skill('price-compare'));
  assert.equal(v1.version, 1);
  assert.equal(v2.version, 2);
  assert.equal(store.get('price-compare')?.version, 2);
});

test('prior versions are immutable across a later put', () => {
  const { store } = open();
  const v1 = store.put(skill('s'));
  store.put(skill('s'));
  const reread = store.get('s', 1);
  assert.deepEqual(reread, v1);
});

test('a demoted head is not served as current', () => {
  const { store } = open();
  store.put(skill('s'));
  store.put(skill('s')); // version 2 is the head
  store.demote('s', 2);
  assert.equal(store.get('s')?.version, 1); // falls back to the highest promoted
  assert.equal(store.get('s', 2)?.status, 'demoted'); // history survives
});

test('records are ciphertext at rest', () => {
  const { disk, store, partition_id } = open();
  store.put({ skill_id: 'SKILL-DISTINCTIVE', signature: 'SIG-DISTINCTIVE', body_ref: 'BODY-DISTINCTIVE' });
  const raw = disk.partitions.get(partition_id)?.rawBytes() ?? '';
  assert.equal(raw.includes('SIG-DISTINCTIVE'), false);
  assert.equal(raw.includes('BODY-DISTINCTIVE'), false);
});
