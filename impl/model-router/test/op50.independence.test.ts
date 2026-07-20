// Op 50 — P5 independence-guard.
// The exclusion always contains the producer for verify; axis widening to family
// and provider matches fixtures; assert_independent rejects a selection equal to
// the producer; an absent or mac-invalid tag is rejected.

import test from 'node:test';
import assert from 'node:assert/strict';
import { assertIndependent, exclusionFor, macValid, stampProducerTag } from '../src/independence.ts';
import { F1, F2, G1, G2, SESSION_KEY } from './helpers.ts';

const ALL = [F1, F2, G1, G2];

test('a stamped tag is mac-valid; a tampered tag is not', () => {
  const tag = stampProducerTag(SESSION_KEY, F1);
  assert.equal(macValid(SESSION_KEY, tag), true);
  assert.equal(macValid(SESSION_KEY, { ...tag, model_id: 'openai:gpt5:2' }), false);
  assert.equal(macValid(SESSION_KEY, { ...tag, mac: '00'.repeat(32) }), false);
});

test('the model axis excludes exactly the producer model', () => {
  const tag = stampProducerTag(SESSION_KEY, F1);
  const ex = exclusionFor(tag, 'model', ALL);
  assert.deepEqual([...ex], [F1.model_id]);
});

test('the family axis excludes every model_id sharing the producer family', () => {
  const tag = stampProducerTag(SESSION_KEY, F1); // family gpt5
  const ex = exclusionFor(tag, 'family', ALL);
  assert.equal(ex.has(F1.model_id), true);
  assert.equal(ex.has(G1.model_id), true); // openai:mini shares family gpt5
  assert.equal(ex.has(F2.model_id), false); // opus
});

test('the provider axis excludes every model_id sharing the producer provider', () => {
  const tag = stampProducerTag(SESSION_KEY, F1); // provider openai
  const ex = exclusionFor(tag, 'provider', ALL);
  assert.equal(ex.has(F1.model_id), true);
  assert.equal(ex.has(G1.model_id), true);
  assert.equal(ex.has(F2.model_id), false);
  assert.equal(ex.has(G2.model_id), false);
});

test('assert_independent rejects a selection in the exclusion set', () => {
  const ex = new Set([F1.model_id]);
  assert.equal(assertIndependent(F1.model_id, ex), 'violation');
  assert.equal(assertIndependent(F2.model_id, ex), 'ok');
});
