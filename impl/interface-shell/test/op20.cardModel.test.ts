// Op 20 — P2 task-card-model. Replaying a recorded run yields an identical card;
// every event maps to a defined CardStatus; the card is a pure function of the event
// stream.

import test from 'node:test';
import assert from 'node:assert/strict';
import { initialCard, project, projectAll } from '../src/cardModel.ts';
import type { RunEvent } from '../src/types.ts';
import { runEvents, WS } from './helpers.ts';

function card() { return initialCard('task-1', WS, 'A task'); }

test('replaying a recorded run yields the projected card', () => {
  const c = projectAll(card(), runEvents());
  assert.equal(c.status, 'done');
  assert.equal(c.updated_seq, 8);
  assert.deepEqual(c.artifact_refs, ['art-1']);
  assert.deepEqual(c.evidence_refs, ['snap-1']);
  assert.deepEqual(c.plan.map((p) => [p.step_id, p.status]), [['s1', 'succeeded']]);
});

test('the card is a pure function of the event stream', () => {
  const a = projectAll(card(), runEvents());
  const b = projectAll(card(), runEvents());
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('status mapping is defined for every lifecycle transition', () => {
  const seq = (event: RunEvent['event'], n: number, data: Record<string, unknown> = {}): RunEvent => ({ seq: n, ts: 't', event, data });
  assert.equal(project(card(), seq('run.started', 1)).status, 'planning');
  assert.equal(projectAll(card(), [seq('run.started', 1), seq('step.ready', 2, { step_id: 's1' })]).status, 'running');
  assert.equal(project(card(), seq('run.completed', 1, { outcome: 'completed' })).status, 'done');
  assert.equal(project(card(), seq('step.failed', 1, { step_id: 's1' })).status, 'failed');
  assert.equal(project(card(), seq('step.in_doubt', 1, { step_id: 's1' })).status, 'failed');
  assert.equal(project(card(), seq('run.completed', 1, { outcome: 'blocked' })).status, 'failed'); // a blocked run is not done
});

test('an event at or below updated_seq is an idempotent no-op', () => {
  const c = projectAll(card(), runEvents());
  const again = project(c, { seq: 5, ts: 't', event: 'action.submitted', data: { proposal_ref: 'x' } });
  assert.equal(again, c); // unchanged reference — re-delivery never double-applies
});

test('artifact and evidence refs are de-duplicated on re-projection', () => {
  const base = projectAll(card(), runEvents());
  // A higher-seq duplicate perception.read of the same snapshot does not double the ref.
  const c = project(base, { seq: 9, ts: 't', event: 'perception.read', data: { step_id: 's1', snapshot_ref: 'snap-1' } });
  assert.deepEqual(c.evidence_refs, ['snap-1']);
});
