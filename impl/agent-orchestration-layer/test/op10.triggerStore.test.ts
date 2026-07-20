// Op 10 — P4 trigger-store. Write triggers, "restart" the process, reload; every
// armed trigger survives with next_fire_at recomputed; run records stay append-only
// and ordered; a durable write flushes before return.

import test from 'node:test';
import assert from 'node:assert/strict';
import { TriggerStore } from '../src/triggerStore.ts';
import { FakeWorkspaceStore, MutableClock, scheduledTrigger, WS } from './helpers.ts';

test('a put is durable and survives a restart', () => {
  const ws = new FakeWorkspaceStore();
  const clock = new MutableClock(0);
  const before = ws.flushes;
  new TriggerStore(ws, clock, WS).put(scheduledTrigger());
  assert.ok(ws.flushes > before); // durable

  const restarted = new TriggerStore(ws, clock, WS); // fresh instance, same storage
  assert.equal(restarted.get('trig-1')?.trigger_id, 'trig-1');
});

test('load_armed returns armed triggers with next_fire_at recomputed for missed instants', () => {
  const ws = new FakeWorkspaceStore();
  const store = new TriggerStore(ws, new MutableClock(0), WS);
  store.put(scheduledTrigger({ schedule: { interval_seconds: 60, anchor: 0 }, next_fire_at: 60 }));
  const armed = store.load_armed(200); // now = 200; instants 60,120,180 all missed
  assert.equal(armed.length, 1);
  assert.equal(armed[0]!.next_fire_at, 180); // coalesced to the most recent due instant
});

test('a paused trigger is not returned by load_armed', () => {
  const store = new TriggerStore(new FakeWorkspaceStore(), new MutableClock(0), WS);
  store.put(scheduledTrigger({ state: 'paused' }));
  assert.equal(store.load_armed(1000).length, 0);
});

test('run records are append-only and ordered by firing', () => {
  const store = new TriggerStore(new FakeWorkspaceStore(), new MutableClock(5), WS);
  store.record_run('trig-1', 'run-1', 'started');
  store.record_run('trig-1', 'run-1', 'done', 'artifact:1');
  const recs = store.runs('trig-1');
  assert.deepEqual(recs.map((r) => r.state), ['started', 'done']);
  assert.equal(recs[0]!.started_at, 5);
});

test('has_active_run tracks a started run without a terminal record', () => {
  const store = new TriggerStore(new FakeWorkspaceStore(), new MutableClock(0), WS);
  store.record_run('trig-1', 'run-1', 'started');
  assert.equal(store.has_active_run('trig-1'), true);
  store.record_run('trig-1', 'run-1', 'done');
  assert.equal(store.has_active_run('trig-1'), false);
});
