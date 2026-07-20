// Op 10 — P1 routing-policy.
// A valid policy loads and serves; empty-pool, no-endpoint, missing-price,
// non-positive-price, and unknown-currency files each refuse; select is
// priority-ordered and excludes the exclusion set; identical inputs give an
// identical binding; policy_rev strictly increments.

import test from 'node:test';
import assert from 'node:assert/strict';
import { RoutingPolicy } from '../src/policy.ts';
import { isRejection } from '../src/types.ts';
import type { Policy } from '../src/types.ts';
import { F1, F2, samplePolicy } from './helpers.ts';

function load(p: Policy) {
  const rp = new RoutingPolicy();
  return { rp, res: rp.load(p) };
}

test('a valid policy loads and serves; policy_rev increments', () => {
  const rp = new RoutingPolicy();
  const a = rp.load(samplePolicy());
  const b = rp.load(samplePolicy());
  if (isRejection(a) || isRejection(b)) throw new Error('load rejected');
  assert.equal(a.policy_rev, 1);
  assert.equal(b.policy_rev, 2);
  assert.equal(rp.current()?.policy_rev, 2);
});

test('malformed policies are refused fail-closed', () => {
  assert.equal(isRejection(load(samplePolicy({ workspace_id: '' })).res), true);
  assert.equal(isRejection(load(samplePolicy({ pools: { frontier: [], fast: [F1] } })).res), true); // empty mapped pool
  assert.equal(isRejection(load(samplePolicy({ pools: { frontier: [{ ...F1, endpoint: '' }], fast: [F2] } })).res), true);
  assert.equal(isRejection(load(samplePolicy({ prices: { 'anthropic:opus:1': { input_minor_per_ktok: 1, output_minor_per_ktok: 1, currency: 'USD' } } })).res), true); // F1 unpriced
  assert.equal(isRejection(load(samplePolicy({ prices: { ...samplePolicy().prices, 'openai:gpt5:1': { input_minor_per_ktok: 0, output_minor_per_ktok: 1, currency: 'USD' } } })).res), true);
  assert.equal(isRejection(load(samplePolicy({ prices: { ...samplePolicy().prices, 'openai:gpt5:1': { input_minor_per_ktok: 1, output_minor_per_ktok: 1, currency: 'XYZ' } } })).res), true);
});

test('a refused load leaves the prior policy unchanged', () => {
  const rp = new RoutingPolicy();
  rp.load(samplePolicy());
  const before = rp.current()?.policy_rev;
  rp.load(samplePolicy({ workspace_id: '' }));
  assert.equal(rp.current()?.policy_rev, before);
});

test('select is priority-ordered, excludes the exclusion set, and is deterministic', () => {
  const rp = new RoutingPolicy();
  rp.load(samplePolicy());
  const first = rp.select('frontier', new Set());
  assert.equal(first?.model_id, F1.model_id); // best-first
  assert.deepEqual(rp.select('frontier', new Set()), first); // deterministic
  const excluded = rp.select('frontier', new Set([F1.model_id]));
  assert.equal(excluded?.model_id, F2.model_id);
  assert.equal(rp.select('frontier', new Set([F1.model_id, F2.model_id])), null);
});
