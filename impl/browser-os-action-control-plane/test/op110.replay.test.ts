// Op 110 — end-to-end replay.
// Run a three-action session, then reconstruct it from the log alone: verify is
// clean, every event is in the taxonomy, and the reconstructed decisions match the
// run exactly.

import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_TAXONOMY } from '../src/index.ts';
import { makeGate, makeProposal } from './helpers.ts';

test('a three-action session reconstructs from the log alone', () => {
  const w = makeGate();

  // 1) an ALLOW click, 2) an approved monetary CONFIRM, 3) a cross-workspace BLOCK.
  const r1 = w.gate.submit(makeProposal({ kind: 'click', target_node: 'btnClick', token_id: w.transactToken, declared: { intent_text: 'x', origin: 'https://shop', tier: 'interact', consequence: 'reversible', amount_minor: null, currency: null } }));
  const r2 = w.gate.submit(makeProposal({ token_id: w.transactToken }));
  const r3 = w.gate.submit(makeProposal({ workspace_id: 'w2', token_id: w.transactToken }));

  // The chain verifies clean.
  assert.equal(w.audit.verify().ok, true);

  // Every event is inside the closed taxonomy.
  for (const e of w.audit.readAll()) assert.equal(EVENT_TAXONOMY.has(e.event), true, 'unexpected event ' + e.event);

  // Reconstruct the decisions from decision.rendered records.
  const rendered = w.audit.readAll().filter((e) => e.event === 'decision.rendered');
  const reconstructed = rendered.map((e) => (e.data as { verdict: string }).verdict);
  assert.deepEqual(reconstructed, [r1.decision.verdict, r2.decision.verdict, r3.decision.verdict]);
  assert.deepEqual(reconstructed, ['ALLOW', 'CONFIRM', 'BLOCK']);

  // The dispatched actions each have their durable pre-dispatch record.
  const dispatched = w.audit.readAll().filter((e) => e.event === 'action.dispatched').length;
  const results = w.audit.readAll().filter((e) => e.event === 'action.result').length;
  assert.equal(dispatched, results);
  assert.equal(dispatched, 2); // the click and the approved buy
});
