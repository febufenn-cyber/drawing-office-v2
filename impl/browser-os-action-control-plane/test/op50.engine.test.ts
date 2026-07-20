// Op 50 — P4 policy-engine.
// One vector per check code triggers exactly that code and floor; verdict is the
// max severity on mixed vectors; identical inputs give identical Decisions; the
// verdict-floor rows hold.

import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, PolicyStore } from '../src/index.ts';
import type { BudgetSnapshot, TokenState } from '../src/engine.ts';
import type { ResolvedAction, Tier, Consequence } from '../src/types.ts';
import { samplePolicy } from './helpers.ts';

const NOW = '2026-07-20T00:00:00Z';
const ps = new PolicyStore();
ps.load(samplePolicy());
const POLICY = ps.current();

function res(over: Partial<ResolvedAction> = {}): ResolvedAction {
  return {
    proposal_ref: 'p', workspace_id: 'w1', origin: 'https://shop', nav_epoch: 0,
    target_digest: 'd', form_digest: null, method: 'NONE', endpoint: null, payload_classes: [],
    amount_minor: null, currency: null, entity_count: 1, destructive: false, token_id: null,
    secret_ref: null, tier_effective: 'read', consequence_effective: 'reversible', mismatches: [],
    kind: 'click', handle_ref: 'h1', ...over,
  };
}
function token(tier: Tier, in_scope = true, live = true, budget_minor: number | null = null): TokenState {
  return { token_id: 't', tier, in_scope, live, budget_minor };
}
function bud(over: Partial<BudgetSnapshot> = {}): BudgetSnapshot {
  return { month_spent_minor: 0, actions_last_min: 0, origin_actions_last_min: 0, token: null, handle_workspace_id: 'w1', ...over };
}
function codes(d: { findings: readonly { code: string }[] }): string[] {
  return d.findings.map((f) => f.code);
}

test('NO_POLICY when no policy is loaded', () => {
  const d = evaluate(null, res(), bud(), NOW);
  assert.equal(d.verdict, 'BLOCK');
  assert.deepEqual(codes(d), ['NO_POLICY']);
});

test('OK when every check passes', () => {
  const d = evaluate(POLICY, res(), bud(), NOW);
  assert.equal(d.verdict, 'ALLOW');
  assert.deepEqual(codes(d), ['OK']);
});

test('each check code triggers at its verdict floor', () => {
  const monetary: Partial<ResolvedAction> = { tier_effective: 'transact', consequence_effective: 'monetary', amount_minor: 5000, currency: 'USD' };

  const cases: Array<{ name: string; d: ReturnType<typeof evaluate>; code: string; verdict: string }> = [
    { name: 'DECLARED_MISMATCH', d: evaluate(POLICY, res({ mismatches: ['tier'] }), bud(), NOW), code: 'DECLARED_MISMATCH', verdict: 'CONFIRM' },
    { name: 'ORIGIN_FORBIDDEN', d: evaluate(POLICY, res({ origin: 'https://evil' }), bud(), NOW), code: 'ORIGIN_FORBIDDEN', verdict: 'BLOCK' },
    { name: 'TIER_EXCEEDED', d: evaluate(POLICY, res({ origin: 'https://mail', tier_effective: 'transact' }), bud({ token: token('transact') }), NOW), code: 'TIER_EXCEEDED', verdict: 'BLOCK' },
    { name: 'TOKEN_INVALID', d: evaluate(POLICY, res({ tier_effective: 'interact' }), bud(), NOW), code: 'TOKEN_INVALID', verdict: 'BLOCK' },
    { name: 'IRREVERSIBLE', d: evaluate(POLICY, res({ consequence_effective: 'irreversible' }), bud(), NOW), code: 'IRREVERSIBLE', verdict: 'CONFIRM' },
    { name: 'MONETARY', d: evaluate(POLICY, res(monetary), bud({ token: token('transact') }), NOW), code: 'MONETARY', verdict: 'CONFIRM' },
    { name: 'AMOUNT_UNRESOLVED', d: evaluate(POLICY, res({ tier_effective: 'transact', consequence_effective: 'monetary', amount_minor: null }), bud({ token: token('transact') }), NOW), code: 'AMOUNT_UNRESOLVED', verdict: 'BLOCK' },
    { name: 'CAP_EXCEEDED', d: evaluate(POLICY, res({ ...monetary, amount_minor: 200000 }), bud({ token: token('transact') }), NOW), code: 'CAP_EXCEEDED', verdict: 'BLOCK' },
    { name: 'EXFIL_PATTERN', d: evaluate(POLICY, res({ tier_effective: 'interact', payload_classes: [{ field_class: 'credential_ref', secret_scope: 'https://other' }] }), bud({ token: token('interact') }), NOW), code: 'EXFIL_PATTERN', verdict: 'BLOCK' },
    { name: 'DESTRUCTIVE_BULK', d: evaluate(POLICY, res({ tier_effective: 'interact', destructive: true, entity_count: 100 }), bud({ token: token('interact') }), NOW), code: 'DESTRUCTIVE_BULK', verdict: 'BLOCK' },
    { name: 'RATE_EXCEEDED', d: evaluate(POLICY, res(), bud({ actions_last_min: 30 }), NOW), code: 'RATE_EXCEEDED', verdict: 'BLOCK' },
    { name: 'CROSS_WORKSPACE', d: evaluate(POLICY, res(), bud({ handle_workspace_id: 'w2' }), NOW), code: 'CROSS_WORKSPACE', verdict: 'BLOCK' },
  ];
  for (const c of cases) {
    assert.equal(codes(c.d).includes(c.code), true, c.name + ' missing');
    assert.equal(c.d.verdict, c.verdict, c.name + ' verdict');
  }
});

test('verdict is the max severity across findings', () => {
  // A CONFIRM (mismatch) plus a BLOCK (forbidden) resolves to BLOCK.
  const d = evaluate(POLICY, res({ origin: 'https://evil', mismatches: ['tier'] }), bud(), NOW);
  assert.equal(d.verdict, 'BLOCK');
});

test('evaluate is deterministic', () => {
  const a = evaluate(POLICY, res({ consequence_effective: 'irreversible' as Consequence }), bud(), NOW);
  const b = evaluate(POLICY, res({ consequence_effective: 'irreversible' as Consequence }), bud(), NOW);
  assert.deepEqual(a, b);
});
