// Op 60 — P3 session-partitioner.
// Each workspace maps to exactly one partition; a cookie set in one workspace is
// absent from another workspace's surface; partition_for refuses a key not scoped
// to its workspace_id.

import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionPartitioner } from '../src/partitioner.ts';
import { StubEngine } from '../src/stubEngine.ts';

test('each workspace maps to exactly one partition, reused across surfaces', () => {
  const p = new SessionPartitioner(new StubEngine());
  const a1 = p.partitionFor('A', 'A:k1');
  const a2 = p.partitionFor('A', 'A:k2');
  const b1 = p.partitionFor('B', 'B:k1');
  assert.equal(a1, a2);
  assert.notEqual(a1, b1);
});

test('partition_for refuses a key not scoped to its workspace_id', () => {
  const p = new SessionPartitioner(new StubEngine());
  assert.equal(p.partitionFor('A', 'B:k'), null);
  assert.equal(p.partitionFor('A', 'k-with-no-prefix'), null);
  assert.equal(p.partitionFor('', ':k'), null);
  assert.notEqual(p.partitionFor('A', 'A:k'), null);
});

test('a cookie set in one workspace is absent from another workspace surface', () => {
  const engine = new StubEngine();
  const p = new SessionPartitioner(engine);
  const partA = p.partitionFor('A', 'A:k') as string;
  const partB = p.partitionFor('B', 'B:k') as string;
  const surfA = p.createSurface(partA, 'https://a', 'A');
  const surfB = p.createSurface(partB, 'https://b', 'B');
  engine.setCookie(surfA, 'session', 'secretA');
  assert.equal(engine.cookies(surfA).get('session'), 'secretA');
  assert.equal(engine.cookies(surfB).has('session'), false);

  // A second surface in the same workspace shares the partition's cookies.
  const surfA2 = p.createSurface(partA, 'https://a/2', 'A');
  assert.equal(engine.cookies(surfA2).get('session'), 'secretA');
});
