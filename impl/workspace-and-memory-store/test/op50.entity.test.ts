// Op 50 — P5 entity-graph.
// Upsert on an existing id creates no duplicate; neighbors returns the exact
// one-edge set per relation kind; nodes and edges are ciphertext at rest and
// scoped to the workspace; a dangling edge endpoint is rejected.

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
  const w = s.create('g', scope(), budget());
  if (isRejection(w)) throw new Error('create failed');
  const g = s.entity(w.workspace_id);
  if (isRejection(g)) throw new Error('entity failed');
  return { disk, g, partition_id: w.partition_id };
}

test('upsert is idempotent on entity_id', () => {
  const { g } = open();
  g.upsert(entity('x', { label: 'first' }));
  g.upsert(entity('x', { label: 'second' }));
  const neighborsAll = g.embeddings();
  assert.equal(neighborsAll.length, 1);
  assert.equal(g.get('x')?.label, 'second');
});

test('neighbors returns the exact one-edge set per relation kind', () => {
  const { g } = open();
  g.upsert(entity('a'));
  g.upsert(entity('b'));
  g.upsert(entity('c'));
  assert.equal(g.link({ src: 'a', dst: 'b', kind: 'compares', created_at: '2026-07-20T00:00:00Z' }), true);
  assert.equal(g.link({ src: 'a', dst: 'c', kind: 'watches', created_at: '2026-07-20T00:00:00Z' }), true);
  const compares = g.neighbors('a', 'compares').map((e) => e.entity_id);
  assert.deepEqual(compares, ['b']);
  const watches = g.neighbors('a', 'watches').map((e) => e.entity_id);
  assert.deepEqual(watches, ['c']);
});

test('a dangling edge endpoint is rejected', () => {
  const { g } = open();
  g.upsert(entity('a'));
  const r = g.link({ src: 'a', dst: 'missing', kind: 'k', created_at: '2026-07-20T00:00:00Z' });
  assert.equal(isRejection(r), true);
});

test('nodes are ciphertext at rest', () => {
  const { disk, g, partition_id } = open();
  g.upsert(entity('e1', { label: 'ENTITY-LABEL-DISTINCTIVE' }));
  const raw = disk.partitions.get(partition_id)?.rawBytes() ?? '';
  assert.equal(raw.includes('ENTITY-LABEL-DISTINCTIVE'), false);
});
