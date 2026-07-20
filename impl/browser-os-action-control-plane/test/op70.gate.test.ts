// Op 70 — P5 approval-gate.
// ALLOW dispatches exactly once with a valid ticket; BLOCK records zero act calls;
// CONFIRM without approval never dispatches; approval timeout auto-denies;
// ApprovalRequests label page strings.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGate, makeProposal, makeSnapshot } from './helpers.ts';

test('an ALLOW proposal dispatches exactly once', () => {
  const w = makeGate();
  // A reversible interact click on shop with a valid transact token.
  const p = makeProposal({ kind: 'click', target_node: 'btnClick', token_id: w.transactToken, declared: { intent_text: 'x', origin: 'https://shop', tier: 'interact', consequence: 'reversible', amount_minor: null, currency: null } });
  const r = w.gate.submit(p);
  assert.equal(r.status, 'dispatched');
  assert.equal(r.decision.verdict, 'ALLOW');
  assert.equal(w.surface.actCount, 1);
});

test('a forbidden origin blocks and records zero act calls', () => {
  const w = makeGate({ snapshot: makeSnapshot({ origin: 'https://evil' }) });
  const p = makeProposal({ declared: { intent_text: 'x', origin: 'https://evil', tier: 'transact', consequence: 'monetary', amount_minor: 5000, currency: 'USD' } });
  const r = w.gate.submit(p);
  assert.equal(r.status, 'blocked');
  assert.equal(w.surface.actCount, 0);
});

test('a denied CONFIRM never dispatches', () => {
  const w = makeGate();
  w.approval.approved = false;
  const p = makeProposal({ token_id: w.transactToken });
  const r = w.gate.submit(p);
  assert.equal(r.status, 'denied');
  assert.equal(w.surface.actCount, 0);
});

test('an approved CONFIRM monetary buy dispatches once', () => {
  const w = makeGate();
  const p = makeProposal({ token_id: w.transactToken });
  const r = w.gate.submit(p);
  assert.equal(r.status, 'dispatched');
  assert.equal(w.surface.actCount, 1);
});

test('an approval past the timeout auto-denies', () => {
  const w = makeGate();
  w.approval.elapsed_s = 601; // > 600 s default
  const p = makeProposal({ token_id: w.transactToken });
  const r = w.gate.submit(p);
  assert.equal(r.status, 'denied');
  assert.equal(w.surface.actCount, 0);
});

test('ApprovalRequests carry page strings only under a labeled field', () => {
  const w = makeGate();
  w.gate.submit(makeProposal({ token_id: w.transactToken }));
  const req = w.approval.requests[0];
  assert.ok(req);
  assert.equal(req?.page_content.target_name, 'Pay now');
  // No top-level request field carries the raw page string.
  const topLevel = JSON.stringify({ ...req, page_content: undefined });
  assert.equal(topLevel.includes('Pay now'), false);
});
