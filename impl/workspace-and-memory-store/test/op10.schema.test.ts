// Op 10 — P1 workspace-schema.
// Golden records validate; empty-goal, bad-currency, non-positive-budget, and
// above-transact records reject; every state-event pair resolves to a next state
// or Rejection.

import test from 'node:test';
import assert from 'node:assert/strict';
import { transition, validate } from '../src/schema.ts';
import { isRejection } from '../src/types.ts';
import type { LifecycleEvent, LifecycleState, Workspace } from '../src/types.ts';

function good(): Workspace {
  return {
    workspace_id: 'w1',
    goal: 'compare laptops',
    state: 'active',
    partition_id: 'persist:ws-w1',
    credential_scope: { origins: ['https://shop'], max_tier: 'transact' },
    budget: { currency: 'USD', per_action_minor: 5000, per_month_minor: 200000 },
    created_at: '2026-07-20T00:00:00Z',
    archived_at: null,
  };
}

test('a golden record validates', () => {
  const r = validate(good());
  assert.equal(isRejection(r), false);
});

test('malformed records reject', () => {
  assert.equal(isRejection(validate({ ...good(), goal: '   ' })), true);
  assert.equal(isRejection(validate({ ...good(), budget: { currency: 'DOLLAR', per_action_minor: 1, per_month_minor: 1 } })), true);
  assert.equal(isRejection(validate({ ...good(), budget: { currency: 'USD', per_action_minor: 0, per_month_minor: 1 } })), true);
  assert.equal(isRejection(validate({ ...good(), credential_scope: { origins: [], max_tier: 'root' } })), true);
  assert.equal(isRejection(validate({ ...good(), extra_field: 1 })), true);
  assert.equal(isRejection(validate({ ...good(), goal: 42 })), true);
});

test('the transition table is total: every state-event pair resolves', () => {
  const states: LifecycleState[] = ['active', 'archived', 'deleted'];
  const events: LifecycleEvent[] = ['archive', 'delete', 'reopen'];
  for (const s of states) {
    for (const e of events) {
      const r = transition(s, e);
      // Either a valid next state or a typed Rejection — never undefined/throw.
      assert.equal(typeof r === 'string' || isRejection(r), true);
    }
  }
  assert.equal(transition('active', 'archive'), 'archived');
  assert.equal(transition('active', 'delete'), 'deleted');
  assert.equal(transition('archived', 'reopen'), 'active');
  assert.equal(transition('archived', 'delete'), 'deleted');
  assert.equal(isRejection(transition('active', 'reopen')), true);
  assert.equal(isRejection(transition('deleted', 'reopen')), true);
});
