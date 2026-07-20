// Op 80 — independence battery.
// No verify request routes to the producing model across vectors; forged producer
// tags are rejected by the session mac; a single-frontier verify yields
// independence_unsatisfiable and zero calls; family and provider axis widening are
// honored.

import test from 'node:test';
import assert from 'node:assert/strict';
import { stampProducerTag } from '../src/independence.ts';
import type { Role } from '../src/types.ts';
import { F1, G1, G2, makeRouter, samplePolicy, SESSION_KEY } from './helpers.ts';

function verifyReq(tag = stampProducerTag(SESSION_KEY, F1)) {
  return { workspace_id: 'w1', role: 'verify' as Role, prompt_bundle: 'check', prompt_tokens: 10, max_output: 10, producer_tag: tag };
}

test('a verify request never routes to the producing model (model axis)', () => {
  const w = makeRouter();
  const r = w.dispatcher.route(verifyReq());
  assert.equal(r.status, 'routed');
  assert.notEqual(r.binding?.model_id, F1.model_id);
});

test('a forged producer tag is rejected and makes zero calls', () => {
  const w = makeRouter();
  const bad = { ...stampProducerTag(SESSION_KEY, F1), mac: '00'.repeat(32) };
  const r = w.dispatcher.route(verifyReq(bad));
  assert.equal(r.status, 'invalid_request');
  assert.equal(w.openai.callCount + w.anthropic.callCount, 0);
});

test('a single-frontier pool yields independence_unsatisfiable and zero calls', () => {
  const w = makeRouter({ policy: samplePolicy({ pools: { frontier: [F1], fast: [G1, G2] } }) });
  const r = w.dispatcher.route(verifyReq());
  assert.equal(r.status, 'independence_unsatisfiable');
  assert.equal(w.openai.callCount + w.anthropic.callCount, 0);
});

test('the family axis excludes the producer family from verification', () => {
  const w = makeRouter({ policy: samplePolicy({ independence_axis: 'family' }) });
  const r = w.dispatcher.route(verifyReq()); // producer F1 family gpt5
  assert.equal(r.status, 'routed');
  assert.notEqual(r.binding?.family, 'gpt5');
});

test('the provider axis excludes the producer provider from verification', () => {
  const w = makeRouter({ policy: samplePolicy({ independence_axis: 'provider' }) });
  const r = w.dispatcher.route(verifyReq()); // producer F1 provider openai
  assert.equal(r.status, 'routed');
  assert.notEqual(r.binding?.provider, 'openai');
});
