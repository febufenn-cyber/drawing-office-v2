// Op 50 — P6 replay-monitor. Reported outcomes increment the matching counter
// durably; a stream crossing the criterion raises exactly one demotion signal and
// subsequent failures raise none; counters survive process restart and are
// per-workspace.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ReplayMonitor } from '../src/monitor.ts';
import { FakeWorkspaceStore, WS } from './helpers.ts';

const SIG = 'shop.search';

test('outcomes increment the matching counter durably', () => {
  const ws = new FakeWorkspaceStore();
  const m = new ReplayMonitor(ws, WS, 5, 3);
  const before = ws.flushes;
  m.record_outcome(SIG, true);
  m.record_outcome(SIG, false);
  assert.deepEqual(m.counts(SIG), { success: 1, failure: 1 });
  assert.ok(ws.flushes >= before + 2); // each increment flushed
});

test('a stream crossing the threshold raises exactly one demotion signal', () => {
  const m = new ReplayMonitor(new FakeWorkspaceStore(), WS, 5, 3);
  assert.equal(m.record_outcome(SIG, false).signal, false); // 1
  assert.equal(m.record_outcome(SIG, false).signal, false); // 2
  const third = m.record_outcome(SIG, false);
  assert.equal(third.signal, true); // 3rd crosses
  if (third.signal) assert.equal(third.signature, SIG);
  assert.equal(m.record_outcome(SIG, false).signal, false); // already signaled -> none
});

test('the window is bounded — old successes age out so a broken skill still demotes', () => {
  const m = new ReplayMonitor(new FakeWorkspaceStore(), WS, 3, 2); // window 3, threshold 2
  m.record_outcome(SIG, true);
  m.record_outcome(SIG, true);
  assert.equal(m.record_outcome(SIG, false).signal, false); // window [T,T,F], 1 failure
  const sig = m.record_outcome(SIG, false); // window [T,F,F], 2 failures -> cross
  assert.equal(sig.signal, true);
});

test('counters survive a restart and are per-workspace', () => {
  const ws = new FakeWorkspaceStore();
  const first = new ReplayMonitor(ws, WS, 5, 3);
  first.record_outcome(SIG, true);
  first.record_outcome(SIG, false);
  const restarted = new ReplayMonitor(ws, WS, 5, 3); // fresh cache, same storage
  assert.deepEqual(restarted.counts(SIG), { success: 1, failure: 1 });
  const other = new ReplayMonitor(ws, 'ws-other', 5, 3);
  assert.deepEqual(other.counts(SIG), { success: 0, failure: 0 });
});

test('reset clears the counters and the signal latch', () => {
  const m = new ReplayMonitor(new FakeWorkspaceStore(), WS, 5, 3);
  m.record_outcome(SIG, false); m.record_outcome(SIG, false); m.record_outcome(SIG, false);
  m.reset(SIG);
  assert.deepEqual(m.counts(SIG), { success: 0, failure: 0 });
  // After reset the latch is clear, so a new crossing signals again.
  m.record_outcome(SIG, false); m.record_outcome(SIG, false);
  assert.equal(m.record_outcome(SIG, false).signal, true);
});
