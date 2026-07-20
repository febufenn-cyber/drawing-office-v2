// Op 20 — P6 run-log. Append events then read_all yields them in append order;
// sequence strictly monotonic; process restart resumes the sequence; a durable
// append returns only after the stub records a flush.

import test from 'node:test';
import assert from 'node:assert/strict';
import { RunLog } from '../src/runLog.ts';
import { FakeWorkspaceStore, FIXED_CLOCK, WS } from './helpers.ts';

test('read_all yields entries in append order with a strictly monotonic seq', () => {
  const log = new RunLog(new FakeWorkspaceStore(), FIXED_CLOCK, WS);
  log.append('run.started', { graph_id: 'g1', workspace_id: WS }, false);
  log.append('step.ready', { step_id: 's1', attempt: 1 }, false);
  log.append('step.succeeded', { step_id: 's1', input_digest: 'd', output_ref: 'd' }, false);
  const seqs = log.readAll().map((e) => e.seq);
  assert.deepEqual(seqs, [1, 2, 3]);
  assert.deepEqual(log.readAll().map((e) => e.event), ['run.started', 'step.ready', 'step.succeeded']);
});

test('a fresh log over persistent storage resumes the sequence after restart', () => {
  const ws = new FakeWorkspaceStore();
  const first = new RunLog(ws, FIXED_CLOCK, WS);
  first.append('run.started', { graph_id: 'g1' }, true);
  first.append('step.ready', { step_id: 's1' }, false);
  // "restart": a new RunLog over the same store.
  const second = new RunLog(ws, FIXED_CLOCK, WS);
  assert.equal(second.head(), 2);
  const e = second.append('step.succeeded', { step_id: 's1' }, false);
  assert.equal(e.seq, 3);
  assert.deepEqual(second.readAll().map((x) => x.seq), [1, 2, 3]);
});

test('a durable append flushes before it acks', () => {
  const ws = new FakeWorkspaceStore();
  const log = new RunLog(ws, FIXED_CLOCK, WS);
  assert.equal(ws.flushes, 0);
  log.append('step.pre_dispatch', { step_id: 's1', input_digest: 'd', idempotency_key: 's1:d' }, true);
  assert.equal(ws.flushes, 1); // the durable append flushed
  // The entry is durably present immediately after the ack.
  assert.equal(log.readAll().length, 1);
});

test('a non-durable append does not flush', () => {
  const ws = new FakeWorkspaceStore();
  const log = new RunLog(ws, FIXED_CLOCK, WS);
  log.append('step.ready', { step_id: 's1' }, false);
  assert.equal(ws.flushes, 0);
  assert.equal(ws.nonDurableWrites, 1);
});

test('the log is per-workspace', () => {
  const ws = new FakeWorkspaceStore();
  new RunLog(ws, FIXED_CLOCK, 'wsA').append('run.started', {}, false);
  const b = new RunLog(ws, FIXED_CLOCK, 'wsB');
  assert.equal(b.head(), 0); // wsB has its own empty log
});
