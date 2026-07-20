// Op 30 — P3 activity-stream. Each surfaced event yields one activity item in seq
// order; non-surfaced events yield none; the feed exposes no control path; replaying
// a run's log reconstructs a byte-identical feed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { feed, projectActivity } from '../src/activityStream.ts';
import * as activityModule from '../src/activityStream.ts';
import { runEvents } from './helpers.ts';

test('the feed has one item per surfaced event, in seq order', () => {
  const items = feed(runEvents());
  assert.deepEqual(items.map((i) => i.seq), [1, 2, 5, 6, 7, 8]); // strategy_chosen (3) and pre_dispatch (4) excluded
});

test('the two non-surfaced taxonomy events project to none', () => {
  assert.equal(projectActivity({ seq: 3, ts: 't', event: 'step.strategy_chosen', data: {} }), null);
  assert.equal(projectActivity({ seq: 4, ts: 't', event: 'step.pre_dispatch', data: {} }), null);
});

test('an action item links to its proposal_ref; a perception item to its evidence ref', () => {
  const items = feed(runEvents());
  const action = items.find((i) => i.kind === 'action');
  const evidence = items.find((i) => i.kind === 'evidence');
  assert.equal(action?.text, 'Action proposed');
  assert.equal(action?.ref, 'pr-1');
  assert.equal(evidence?.ref, 'snap-1');
});

test('a failed step surfaces as an alert', () => {
  const item = projectActivity({ seq: 9, ts: 't', event: 'step.failed', data: { step_id: 's2' } });
  assert.equal(item?.kind, 'alert');
  assert.equal(item?.text, 's2 failed');
});

test('replaying the log reconstructs a byte-identical feed', () => {
  assert.equal(JSON.stringify(feed(runEvents())), JSON.stringify(feed(runEvents())));
});

test('the stream module exposes no control path — only projection', () => {
  // Read-only: the module surface is projectActivity and feed; no submit/approve/act.
  const exported = Object.keys(activityModule).sort();
  assert.deepEqual(exported, ['feed', 'projectActivity']);
});
