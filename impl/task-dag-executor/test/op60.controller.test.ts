// Op 60 — P5 resume-controller. An uninterrupted run and a run interrupted at each
// (clean) step boundary complete the same step set; no step with a honored
// checkpoint re-executes; replay from the log alone reconstructs the sequence and
// issues zero stub calls. (Consequential in-doubt / at-most-once is Op 70.)

import test from 'node:test';
import assert from 'node:assert/strict';
import { ResumeController } from '../src/controller.ts';
import type { Dispatcher, DispatchContext } from '../src/dispatcher.ts';
import type { Step, StepResult } from '../src/types.ts';
import { FakeWorkspaceStore, FIXED_CLOCK, HANDLE, linearGraph, wire, WS } from './helpers.ts';

const REQ = { workspace_id: WS, handle: HANDLE };

// Delegates the first `after` dispatches, then throws — modeling a crash at a
// clean boundary (the prior step is fully settled before the next one starts).
class CrashAfter implements Dispatcher {
  private done = 0;
  constructor(private readonly inner: Dispatcher, private readonly after: number) {}
  dispatch(ctx: DispatchContext, step: Step, inputs: Readonly<Record<string, unknown>>, idem: string): StepResult {
    if (this.done >= this.after) throw new Error('crash');
    this.done++;
    return this.inner.dispatch(ctx, step, inputs, idem);
  }
}

test('an uninterrupted run completes every step exactly once', () => {
  const w = wire();
  const outcome = w.controller.run(linearGraph(), REQ);
  assert.deepEqual(outcome, { status: 'completed', executed: 5 });
  for (const id of ['s1', 's2', 's3', 's4', 's5']) assert.equal(w.checkpoints.latest(id)?.status, 'succeeded');
  assert.equal(w.control.submissions.length, 2); // s1, s4
  assert.equal(w.model.calls, 1); // s3
  assert.equal(w.surface.snapshots, 2); // s2, s5
});

test('re-running a completed graph re-executes nothing', () => {
  const ws = new FakeWorkspaceStore();
  wire({ ws }).controller.run(linearGraph(), REQ); // first, full run
  const second = wire({ ws }); // fresh stubs, same storage
  const outcome = second.controller.run(linearGraph(), REQ);
  assert.deepEqual(outcome, { status: 'completed', executed: 0 });
  assert.equal(second.control.submissions.length, 0);
  assert.equal(second.model.calls, 0);
  assert.equal(second.surface.snapshots, 0);
});

test('a crash at each clean boundary resumes to the same completed step set', () => {
  for (const after of [1, 2, 4]) {
    const ws = new FakeWorkspaceStore();
    const crashed = wire({ ws });
    const crashingController = new ResumeController(
      crashed.checkpoints, new CrashAfter(crashed.dispatcher, after), crashed.log, FIXED_CLOCK,
    );
    assert.throws(() => crashingController.run(linearGraph(), REQ));

    const resumed = wire({ ws });
    const outcome = resumed.controller.run(linearGraph(), REQ);
    assert.equal(outcome.status, 'completed', 'after=' + after);
    for (const id of ['s1', 's2', 's3', 's4', 's5']) assert.equal(resumed.checkpoints.latest(id)?.status, 'succeeded', id + ' after=' + after);
    // The resume did only the steps not already settled before the crash.
    assert.equal(resumed.control.submissions.length + resumed.model.calls + resumed.surface.snapshots, 5 - after);
  }
});

test('replay reconstructs the ordered step sequence and issues zero stub calls', () => {
  const w = wire();
  w.controller.run(linearGraph(), REQ);
  const subsBefore = w.control.submissions.length;
  const callsBefore = w.model.calls;
  const snapsBefore = w.surface.snapshots;

  const state = w.controller.replay();
  assert.deepEqual(state.steps.map((s) => s.step_id), ['s1', 's2', 's3', 's4', 's5']);
  assert.ok(state.steps.every((s) => s.status === 'succeeded'));
  assert.equal(state.events.length, w.log.readAll().length);
  // Replay touched no execution boundary.
  assert.equal(w.control.submissions.length, subsBefore);
  assert.equal(w.model.calls, callsBefore);
  assert.equal(w.surface.snapshots, snapsBefore);
});
