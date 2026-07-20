// Op 70 — exactly-once and in-doubt battery. Each consequential step submits to
// the control plane at most once across repeated crash-resume cycles; a step
// interrupted between submission and settle is marked in_doubt and never
// auto-resubmits; every act-class effect is preceded by its durable pre_dispatch
// record.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ResumeController } from '../src/controller.ts';
import type { Dispatcher, DispatchContext } from '../src/dispatcher.ts';
import type { RunEntry, Step, StepResult } from '../src/types.ts';
import { FakeControlPlane, FakeWorkspaceStore, FIXED_CLOCK, HANDLE, CONTROL_OUTPUTS, linearGraph, wire, WS } from './helpers.ts';

const REQ = { workspace_id: WS, handle: HANDLE };

// Submits for real (the control plane records it), then crashes before the
// controller can write the checkpoint and settle record — the in-doubt window.
class CrashAfterSubmit implements Dispatcher {
  constructor(private readonly inner: Dispatcher, private readonly stepId: string) {}
  dispatch(ctx: DispatchContext, step: Step, inputs: Readonly<Record<string, unknown>>, idem: string): StepResult {
    const r = this.inner.dispatch(ctx, step, inputs, idem);
    if (step.step_id === this.stepId) throw new Error('crash after submit, before settle');
    return r;
  }
}

test('a consequential step interrupted after submit is in_doubt and never auto-resubmits', () => {
  const ws = new FakeWorkspaceStore();
  const control = new FakeControlPlane(CONTROL_OUTPUTS); // shared across the cycle

  // Crash while dispatching s4 (fill), after the control plane records the submit.
  const first = wire({ ws, control });
  const crashing = new ResumeController(first.checkpoints, new CrashAfterSubmit(first.dispatcher, 's4'), first.log, FIXED_CLOCK);
  assert.throws(() => crashing.run(linearGraph(), REQ));
  assert.equal(control.countFor('s4'), 1); // submitted exactly once before the crash

  // Resume three times; each must halt in_doubt without a second submission.
  for (let i = 0; i < 3; i++) {
    const resumed = wire({ ws, control });
    const outcome = resumed.controller.run(linearGraph(), REQ);
    assert.deepEqual(outcome, { status: 'halted_in_doubt', step_id: 's4' });
    assert.equal(control.countFor('s4'), 1); // never resubmitted
  }
});

test('the log records step.in_doubt for the interrupted step', () => {
  const ws = new FakeWorkspaceStore();
  const control = new FakeControlPlane(CONTROL_OUTPUTS);
  const first = wire({ ws, control });
  const crashing = new ResumeController(first.checkpoints, new CrashAfterSubmit(first.dispatcher, 's4'), first.log, FIXED_CLOCK);
  assert.throws(() => crashing.run(linearGraph(), REQ));
  wire({ ws, control }).controller.run(linearGraph(), REQ);

  const log: RunEntry[] = wire({ ws, control }).log.readAll();
  assert.ok(log.some((e) => e.event === 'step.in_doubt' && e.data['step_id'] === 's4'));
});

test('a successful run submits each consequential step exactly once', () => {
  const w = wire();
  w.controller.run(linearGraph(), REQ);
  assert.equal(w.control.countFor('s1'), 1);
  assert.equal(w.control.countFor('s4'), 1);
});

test('every act-class submission is preceded by its durable pre_dispatch record', () => {
  const w = wire();
  const flushesBefore = w.ws.flushes;
  w.controller.run(linearGraph(), REQ);
  const log = w.log.readAll();

  for (const submitted of log.filter((e) => e.event === 'action.submitted')) {
    const stepId = submitted.data['step_id'];
    const pre = log.find((e) => e.event === 'step.pre_dispatch' && e.data['step_id'] === stepId);
    assert.ok(pre, 'pre_dispatch exists for ' + String(stepId));
    assert.ok(pre!.seq < submitted.seq, 'pre_dispatch precedes submission for ' + String(stepId));
  }
  // Two consequential steps each flushed a durable pre_dispatch record.
  assert.ok(w.ws.flushes >= flushesBefore + 2);
});
