// Op 90 — key non-leak and cost-integrity battery.
// Provider-key bytes crossing to callers, logs, or cost records equal zero; every
// model in every pool has a price entry; metered totals equal the sum of per-call
// costs exactly.

import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_CLASSES } from '../src/types.ts';
import type { Role } from '../src/types.ts';
import { ANTHROPIC_KEY, makeRouter, OPENAI_KEY } from './helpers.ts';

test('no provider key byte appears in any RouteResult or cost record', () => {
  const w = makeRouter();
  const roles: Role[] = ['plan', 'extract', 'classify'];
  for (const role of roles) {
    const r = w.dispatcher.route({ workspace_id: 'w1', role, prompt_bundle: 'p', prompt_tokens: 100, max_output: 100 });
    const dump = JSON.stringify(r);
    assert.equal(dump.includes(OPENAI_KEY), false);
    assert.equal(dump.includes(ANTHROPIC_KEY), false);
  }
  for (const rec of w.budget.records) {
    const d = JSON.stringify(rec);
    assert.equal(d.includes(OPENAI_KEY) || d.includes(ANTHROPIC_KEY), false);
  }
});

test('every model in every pool has a price entry', () => {
  const w = makeRouter();
  const pol = w.policy.current();
  assert.ok(pol);
  if (pol) {
    for (const cls of MODEL_CLASSES) {
      for (const b of pol.pools[cls]) assert.ok(pol.prices[b.model_id], b.model_id + ' has no price');
    }
  }
});

test('the metered total equals the sum of per-call costs exactly', () => {
  const w = makeRouter();
  const roles: Role[] = ['plan', 'extract', 'classify', 'extract'];
  let expected = 0;
  for (const role of roles) {
    const r = w.dispatcher.route({ workspace_id: 'w1', role, prompt_bundle: 'p', prompt_tokens: 1234, max_output: 567 });
    expected += r.cost?.cost_minor ?? 0;
  }
  const total = w.budget.records.reduce((s, rec) => s + rec.cost_minor, 0);
  assert.equal(total, expected);
  assert.equal(w.budget.records.length, roles.length);
});
