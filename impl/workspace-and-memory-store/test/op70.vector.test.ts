// Op 70 — P7 vector-index.
// kNN returns the true nearest by distance; a wrong-dimension vector is rejected;
// results never include a row from another partition.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Disk } from '../src/disk.ts';
import { KeyProvisioner } from '../src/keyProvisioner.ts';
import { isRejection } from '../src/types.ts';
import { WorkspaceStore } from '../src/workspaceStore.ts';
import { budget, entity, MASTER, now, scope } from './helpers.ts';

function open() {
  const disk = new Disk();
  const s = new WorkspaceStore(disk, new KeyProvisioner(MASTER), now);
  return { s };
}

test('kNN returns the true nearest by distance ascending', () => {
  const { s } = open();
  const w = s.create('g', scope(), budget());
  if (isRejection(w)) throw new Error('create failed');
  const g = s.entity(w.workspace_id);
  if (isRejection(g)) throw new Error('entity failed');
  g.upsert(entity('near', { embedding: [1, 0] }));
  g.upsert(entity('mid', { embedding: [0, 1] }));
  g.upsert(entity('far', { embedding: [5, 5] }));
  const idx = s.vectorIndex(w.workspace_id, { episodic: 4, entity: 2 });
  if (isRejection(idx)) throw new Error('index failed');
  const res = idx.search('entity', [1, 0], 2);
  if (isRejection(res)) throw new Error('search rejected');
  assert.deepEqual(res.map((r) => r.row_id), ['near', 'mid']);
  assert.equal(res[0]?.distance, 0);
});

test('a wrong-dimension query is rejected, never reshaped', () => {
  const { s } = open();
  const w = s.create('g', scope(), budget());
  if (isRejection(w)) throw new Error('create failed');
  const idx = s.vectorIndex(w.workspace_id, { episodic: 4, entity: 2 });
  if (isRejection(idx)) throw new Error('index failed');
  assert.equal(isRejection(idx.search('entity', [1, 2, 3], 1)), true);
  assert.equal(idx.checkDimension('entity', [1, 2]), true);
  assert.equal(idx.checkDimension('entity', [1, 2, 3]), false);
});

test('search never returns a row from another partition', () => {
  const { s } = open();
  const a = s.create('a', scope(), budget());
  const b = s.create('b', scope(), budget());
  if (isRejection(a) || isRejection(b)) throw new Error('create failed');
  const ga = s.entity(a.workspace_id);
  const gb = s.entity(b.workspace_id);
  if (isRejection(ga) || isRejection(gb)) throw new Error('entity failed');
  ga.upsert(entity('a-row', { embedding: [1, 1] }));
  gb.upsert(entity('b-row', { embedding: [1, 1] }));
  const idxA = s.vectorIndex(a.workspace_id, { episodic: 4, entity: 2 });
  if (isRejection(idxA)) throw new Error('index failed');
  const res = idxA.search('entity', [1, 1], 10);
  if (isRejection(res)) throw new Error('search rejected');
  assert.deepEqual(res.map((r) => r.row_id), ['a-row']);
});
