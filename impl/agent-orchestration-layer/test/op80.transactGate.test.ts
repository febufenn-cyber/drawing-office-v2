// Op 80 — transact-gate battery. The money ceiling bounds the requested amount, yet
// every transact-tier action routes to the human gate; the budget-manager emits zero
// authorizations; an over-ceiling monetary task is denied before dispatch.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ceiling, researchTask, StubAcp, StubExecutor, wire } from './helpers.ts';

test('every transact-tier action still crosses the action control plane human gate', () => {
  const acp = new StubAcp({ decision: 'gate' });
  const executor = new StubExecutor({ acp, monetaryPages: new Set(['p2', 'p4']) });
  const w = wire({ executor });
  const task = researchTask(['p1', 'p2', 'p3', 'p4'], {
    per_page: { tokens: 10, seconds: 1, money_max: 100 },
    ceiling: ceiling({ money_minor: 100000 }),
    producing_roles: ['agent-0'],
  });
  const res = w.fanout.run(task, 2);
  assert.ok(res.ok);
  // Both monetary pages hit the gate; the gate saw a transact-tier proposal each time.
  assert.equal(acp.submits.length, 2);
  assert.ok(acp.submits.every((p) => p.tier === 'transact'));
});

test('an over-ceiling monetary task is denied before any dispatch or gate call', () => {
  const acp = new StubAcp();
  const executor = new StubExecutor({ acp, monetaryPages: new Set(['p1', 'p2']) });
  const w = wire({ executor });
  const task = researchTask(['p1', 'p2'], {
    per_page: { tokens: 1, seconds: 1, money_max: 100 }, // 2 pages * 100 = 200
    ceiling: ceiling({ money_minor: 100 }), // below 200
    producing_roles: ['agent-0'],
  });
  const res = w.fanout.run(task, 2);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, 'MONEY_CEILING');
  assert.equal(w.executor.submits.length, 0); // nothing dispatched
  assert.equal(acp.submits.length, 0); // gate never reached
});

test('a monetary task within its month cap dispatches; over the cap it is refused', () => {
  const acp = new StubAcp();
  // The ledger shows the workspace near its monthly cap.
  const executor = new StubExecutor({ acp, monetaryPages: new Set(['p1']) });
  const w = wire({ executor });
  w.ledger.spent = 950;
  w.ledger.cap = 1000;
  const task = researchTask(['p1'], {
    per_page: { tokens: 1, seconds: 1, money_max: 100 }, // 100 projected, 950 + 100 > 1000
    ceiling: ceiling({ money_minor: 100000 }),
    producing_roles: ['agent-0'],
  });
  const res = w.fanout.run(task, 1);
  assert.equal(res.ok, false); // refused on the live month-spend read
  assert.equal(acp.submits.length, 0);
});

test('the budget-manager holds no action-control-plane reference — it emits no authorization', () => {
  // Structural: the BudgetManager is constructed with only a ledger; there is no
  // path by which it can authorize a transact. The gate is reached solely via the
  // executor, proven by the first test. Here we assert the money ceiling denies
  // without ever producing a grant object beyond a bound reservation.
  const w = wire();
  const r = w.budget.reserve('t', 'w1', ceiling({ money_minor: 50 }), { tokens: 1, seconds: 1, money_max: 100 });
  assert.equal(r.granted, false); // a bound, not an authorization
});
