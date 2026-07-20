// Op 30 — P3 policy-store.
// A valid policy loads and rev increments; transact-without-caps, unknown-key,
// empty-workspace, non-positive-limit, and bad-currency files each refuse; a
// refused load leaves the store unchanged.

import test from 'node:test';
import assert from 'node:assert/strict';
import { PolicyStore } from '../src/index.ts';
import type { PolicyDraft } from '../src/policyStore.ts';
import { samplePolicy } from './helpers.ts';

test('a valid policy loads and policy_rev increments', () => {
  const ps = new PolicyStore();
  const a = ps.load(samplePolicy());
  const b = ps.load(samplePolicy());
  assert.equal(a.ok && a.policy.policy_rev, 1);
  assert.equal(b.ok && b.policy.policy_rev, 2);
});

test('the refusal set is exact and fail-closed', () => {
  const ps = new PolicyStore();
  assert.equal(ps.load(samplePolicy({ workspace_id: '' })).ok, false);
  assert.equal(ps.load(samplePolicy({ origin_grants: [{ origin: 'https://x', tier: 'transact' }], caps: null })).ok, false);
  assert.equal(ps.load(samplePolicy({ caps: { currency: 'XYZ', per_action_minor: 1, per_workspace_month_minor: 1 } })).ok, false);
  assert.equal(ps.load(samplePolicy({ caps: { currency: 'USD', per_action_minor: 0, per_workspace_month_minor: 1 } })).ok, false);
  assert.equal(ps.load(samplePolicy({ destructive_bulk_limit: 0 })).ok, false);
  assert.equal(ps.load({ ...samplePolicy(), bogus: 1 } as unknown as PolicyDraft).ok, false);
});

test('a refused load leaves the prior policy unchanged', () => {
  const ps = new PolicyStore();
  ps.load(samplePolicy());
  const before = ps.current()?.policy_rev;
  ps.load(samplePolicy({ workspace_id: '' }));
  assert.equal(ps.current()?.policy_rev, before);
});
