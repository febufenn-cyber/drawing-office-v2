// Op 50 — P5 trigger-engine. A scheduled trigger fires at its due instant; downtime
// across instants coalesces to one fire; an event fires once per match and never on
// non-match; paused and expired triggers never fire.

import test from 'node:test';
import assert from 'node:assert/strict';
import { tick } from '../src/triggerEngine.ts';
import type { Runner } from '../src/triggerEngine.ts';
import type { Trigger } from '../src/types.ts';
import { eventTrigger, FakeWorkspaceStore, MutableClock, scheduledTrigger, WS } from './helpers.ts';
import { TriggerStore } from '../src/triggerStore.ts';

class RecordingRunner implements Runner {
  readonly fired: Trigger[] = [];
  enqueue(t: Trigger): void { this.fired.push(t); }
}

function freshStore(): TriggerStore {
  return new TriggerStore(new FakeWorkspaceStore(), new MutableClock(0), WS);
}

test('a scheduled trigger fires only once its next_fire_at is reached', () => {
  const store = freshStore();
  store.put(scheduledTrigger({ schedule: { interval_seconds: 60, anchor: 0 }, next_fire_at: 60 }));
  const runner = new RecordingRunner();
  assert.equal(tick(30, [], store, runner), 0); // not due
  assert.equal(tick(60, [], store, runner), 1); // due
  assert.equal(runner.fired.length, 1);
});

test('downtime spanning several instants coalesces to exactly one fire', () => {
  const store = freshStore();
  store.put(scheduledTrigger({ schedule: { interval_seconds: 60, anchor: 0 }, next_fire_at: 60 }));
  const runner = new RecordingRunner();
  assert.equal(tick(200, [], store, runner), 1); // instants 60,120,180 missed -> one fire
  assert.equal(runner.fired[0]!.next_fire_at, 240); // advanced strictly past now
});

test('an event trigger fires once on a match and never on a non-match', () => {
  const store = freshStore();
  store.put(eventTrigger('doc.updated'));
  const runner = new RecordingRunner();
  assert.equal(tick(10, [{ type: 'other' }], store, runner), 0); // non-match
  assert.equal(tick(10, [{ type: 'doc.updated' }], store, runner), 1); // match
});

test('a paused trigger never fires', () => {
  const store = freshStore();
  store.put(scheduledTrigger({ state: 'paused', next_fire_at: 10 }));
  assert.equal(tick(1000, [], store, new RecordingRunner()), 0);
});

test('a firing transitions the trigger to state firing', () => {
  const store = freshStore();
  store.put(scheduledTrigger({ next_fire_at: 60 }));
  tick(60, [], store, new RecordingRunner());
  assert.equal(store.get('trig-1')?.state, 'firing');
});
