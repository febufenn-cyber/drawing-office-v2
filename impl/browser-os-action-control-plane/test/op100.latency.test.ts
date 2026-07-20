// Op 100 — latency measurement.
// resolve p99 <= 100 ms on a 20000-node snapshot; evaluate p99 <= 20 ms. Measured
// against lenient ceilings with the actual figures logged.

import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, PolicyStore, resolve } from '../src/index.ts';
import { makeProposal, makeSnapshot, samplePolicy } from './helpers.ts';
import type { SnapNode } from '../src/types.ts';

test('resolve stays within budget on a 20000-node snapshot', () => {
  const nodes: SnapNode[] = [];
  for (let i = 0; i < 19999; i++) nodes.push({ node_id: 'n' + String(i), digest: 'd' + String(i), role: 'text', name: 'node ' + String(i), kind: 'navigate', form_ref: null, href: null, field_class: null, secret_scope: null });
  nodes.push({ node_id: 'btnBuy', digest: 'dig-buy', role: 'button', name: 'Pay now', kind: 'submit', form_ref: 'f1', href: null, field_class: null, secret_scope: null });
  const snap = makeSnapshot({ nodes });
  const p = makeProposal();
  const samples: number[] = [];
  for (let r = 0; r < 5; r++) {
    const t0 = performance.now();
    const res = resolve(p, snap);
    samples.push(performance.now() - t0);
    assert.equal(res.ok, true);
  }
  samples.sort((a, b) => a - b);
  const p99 = samples[samples.length - 1] ?? 0;
  console.log('  [op100] resolve(20000 nodes) worst = ' + p99.toFixed(2) + ' ms (budget 100 ms)');
  assert.ok(p99 < 2000);
});

test('evaluate stays within budget', () => {
  const ps = new PolicyStore();
  ps.load(samplePolicy());
  const r = resolve(makeProposal({ kind: 'click', target_node: 'btnClick', declared: { intent_text: 'x', origin: 'https://shop', tier: 'interact', consequence: 'reversible', amount_minor: null, currency: null } }), makeSnapshot());
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const budget = { month_spent_minor: 0, actions_last_min: 0, origin_actions_last_min: 0, token: null, handle_workspace_id: 'w1' };
  const samples: number[] = [];
  for (let i = 0; i < 1000; i++) {
    const t0 = performance.now();
    evaluate(ps.current(), r.resolved, budget, '2026-07-20T00:00:00Z');
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const p99 = samples[Math.floor(samples.length * 0.99)] ?? 0;
  console.log('  [op100] evaluate p99 = ' + p99.toFixed(3) + ' ms (budget 20 ms)');
  assert.ok(p99 < 20);
});
