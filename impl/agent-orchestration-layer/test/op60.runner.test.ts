// Op 60 — P6 background-runner. A firing runs exactly once; the budget is reserved
// before any dispatch; a denied reservation dispatches nothing; run state is recorded
// and the trigger re-arms.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ceiling, scheduledTrigger, wire } from './helpers.ts';

test('a firing reserves, dispatches once, records done, and re-arms', () => {
  const w = wire();
  const t = scheduledTrigger();
  const out = w.runner.run(t);
  assert.equal(out.status, 'done');
  assert.equal(w.executor.submits.length, 1);
  assert.deepEqual(w.store.runs(t.trigger_id).map((r) => r.state), ['started', 'done']);
  assert.equal(t.state, 'armed'); // re-armed
});

test('a denied reservation dispatches nothing and records a denied run', () => {
  const w = wire();
  // A ceiling below the run request denies before the first executor step.
  const t = scheduledTrigger({ ceiling: ceiling({ tokens: 5 }) }); // request asks for 10 tokens
  const out = w.runner.run(t);
  assert.equal(out.status, 'denied');
  assert.equal(w.executor.submits.length, 0); // nothing dispatched
  assert.deepEqual(w.store.runs(t.trigger_id).map((r) => r.state), ['started', 'denied']);
});

test('the active-run guard refuses a second concurrent run of the same trigger', () => {
  const w = wire();
  const t = scheduledTrigger();
  w.store.record_run(t.trigger_id, 'run-inflight', 'started'); // an in-flight run
  const out = w.runner.run(t);
  assert.deepEqual(out, { status: 'skip' });
  assert.equal(w.executor.submits.length, 0); // no second dispatch
});

test('a fan-out trigger runs the task through the scheduler under a reserved slice', () => {
  const w = wire();
  const task = { id: 'task-fan', workspace: 'w1', page_set: ['p1', 'p2', 'p3'], ceiling: ceiling(), per_page: { tokens: 10, seconds: 1, money_max: 0 }, producing_roles: ['agent-0'] };
  const t = scheduledTrigger({ task_template: { fans_out: true, task, width: 2, dag: null, request: { tokens: 30, seconds: 3, money_max: 0 } } });
  const out = w.runner.run(t);
  assert.equal(out.status, 'done');
  assert.equal(w.executor.submits.length, 2); // two sub-agents dispatched
});
