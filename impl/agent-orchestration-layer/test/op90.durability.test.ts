// Op 90 — durability and catch-up battery. The trigger-store survives; armed
// triggers reload; an interrupted run completes exactly once on recovery, never
// duplicated or lost; missed scheduled instants coalesce to one fire.

import test from 'node:test';
import assert from 'node:assert/strict';
import { tick } from '../src/triggerEngine.ts';
import type { Runner } from '../src/triggerEngine.ts';
import type { Trigger } from '../src/types.ts';
import { FakeWorkspaceStore, MutableClock, scheduledTrigger, wire, WS } from './helpers.ts';
import { TriggerStore } from '../src/triggerStore.ts';

class RecordingRunner implements Runner {
  readonly fired: Trigger[] = [];
  enqueue(t: Trigger): void { this.fired.push(t); }
}

test('an armed trigger reloads across a restart', () => {
  const ws = new FakeWorkspaceStore();
  const clock = new MutableClock(0);
  new TriggerStore(ws, clock, WS).put(scheduledTrigger());
  const reloaded = new TriggerStore(ws, clock, WS);
  assert.equal(reloaded.load_armed(1000).length, 1);
});

test('an interrupted run completes exactly once on recovery', () => {
  const w = wire();
  const t = scheduledTrigger();
  w.store.put(t);
  // Crash mid-run: a started record with no terminal.
  w.store.record_run(t.trigger_id, 'run-crashed', 'started');
  assert.equal(w.store.has_active_run(t.trigger_id), true);

  const out = w.runner.recover(t);
  assert.equal(out.status, 'done');
  const dones = w.store.runs(t.trigger_id).filter((r) => r.run_id === 'run-crashed' && r.state === 'done');
  assert.equal(dones.length, 1); // completed exactly once
  assert.equal(w.store.has_active_run(t.trigger_id), false);
  assert.deepEqual(w.runner.recover(t), { status: 'nothing' }); // nothing left to recover
});

test('recovery neither drops nor doubles: a plain run after a crash is guarded', () => {
  const w = wire();
  const t = scheduledTrigger();
  w.store.put(t);
  w.store.record_run(t.trigger_id, 'run-crashed', 'started');
  // A plain run() while the crashed run is still active is refused (no double).
  assert.deepEqual(w.runner.run(t), { status: 'skip' });
  assert.equal(w.executor.submits.length, 0);
});

test('missed scheduled instants across downtime coalesce to a single fire on restart', () => {
  const ws = new FakeWorkspaceStore();
  const clock = new MutableClock(0);
  new TriggerStore(ws, clock, WS).put(scheduledTrigger({ schedule: { interval_seconds: 60, anchor: 0 }, next_fire_at: 60 }));
  // Restart after a long downtime; tick at now=300 (instants 60..300 all missed).
  const store = new TriggerStore(ws, clock, WS);
  const runner = new RecordingRunner();
  assert.equal(tick(300, [], store, runner), 1); // exactly one catch-up fire
});
