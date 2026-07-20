// Op 10 — P4 adapter-store. put strictly increments the version and never moves
// the pointer; current returns exactly one live version; get round-trips any
// retained version byte-identical; swap moves the pointer atomically; every
// version retains its source trajectory.

import test from 'node:test';
import assert from 'node:assert/strict';
import { AdapterStore } from '../src/store.ts';
import { canonical } from '../src/canonical.ts';
import type { SiteAdapter, Trajectory } from '../src/types.ts';

const ORIGIN = 'https://a.example';

function adapter(id: string): SiteAdapter {
  return { adapter_id: id, origin: ORIGIN, version: 0, tools: [], trajectory_ref: 't-' + id, replay_digest: 'r-' + id, compiled_at: '2026-07-20T00:00:00Z' };
}
function trajectory(id: string): Trajectory {
  return { trajectory_id: 't-' + id, origin: ORIGIN, steps: [] };
}

test('put strictly increments the version per origin', () => {
  const store = new AdapterStore();
  assert.equal(store.put(ORIGIN, adapter('a'), trajectory('a')), 1);
  assert.equal(store.put(ORIGIN, adapter('b'), trajectory('b')), 2);
  assert.equal(store.put(ORIGIN, adapter('c'), trajectory('c')), 3);
});

test('put never moves the current pointer; promotion is a separate swap', () => {
  const store = new AdapterStore();
  store.put(ORIGIN, adapter('a'), trajectory('a'));
  assert.equal(store.currentVersion(ORIGIN), null);
  assert.equal(store.current(ORIGIN), null);
  store.put(ORIGIN, adapter('b'), trajectory('b'));
  assert.equal(store.currentVersion(ORIGIN), null);
});

test('swap moves the pointer to exactly one live version', () => {
  const store = new AdapterStore();
  store.put(ORIGIN, adapter('a'), trajectory('a'));
  store.put(ORIGIN, adapter('b'), trajectory('b'));
  assert.equal(store.swap(ORIGIN, 1), true);
  assert.equal(store.currentVersion(ORIGIN), 1);
  assert.equal(store.current(ORIGIN)?.adapter_id, 'a');
  assert.equal(store.swap(ORIGIN, 2), true);
  assert.equal(store.currentVersion(ORIGIN), 2);
  assert.equal(store.current(ORIGIN)?.adapter_id, 'b');
});

test('swap to an unknown version is rejected and leaves the pointer', () => {
  const store = new AdapterStore();
  store.put(ORIGIN, adapter('a'), trajectory('a'));
  store.swap(ORIGIN, 1);
  assert.equal(store.swap(ORIGIN, 9), false);
  assert.equal(store.currentVersion(ORIGIN), 1);
});

test('get round-trips any retained version byte-identical', () => {
  const store = new AdapterStore();
  store.put(ORIGIN, adapter('a'), trajectory('a'));
  store.put(ORIGIN, adapter('b'), trajectory('b'));
  store.swap(ORIGIN, 2);
  const v1 = store.get(ORIGIN, 1);
  assert.equal(v1?.adapter_id, 'a');
  assert.equal(v1?.version, 1);
  assert.equal(canonical(v1), canonical(store.get(ORIGIN, 1)));
});

test('every version retains its source trajectory', () => {
  const store = new AdapterStore();
  store.put(ORIGIN, adapter('a'), trajectory('a'));
  store.put(ORIGIN, adapter('b'), trajectory('b'));
  assert.equal(store.trajectory(ORIGIN, 1)?.trajectory_id, 't-a');
  assert.equal(store.trajectory(ORIGIN, 2)?.trajectory_id, 't-b');
});

test('versions are per-origin', () => {
  const store = new AdapterStore();
  store.put('https://a.example', adapter('a'), trajectory('a'));
  assert.equal(store.put('https://b.example', adapter('b'), trajectory('b')), 1);
});
