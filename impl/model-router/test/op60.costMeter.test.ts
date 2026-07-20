// Op 60 — P6 cost-meter.
// Cost equals the per-bucket round-up sum in minor units against golden vectors;
// estimate is deterministic; currency comes from the price table.

import test from 'node:test';
import assert from 'node:assert/strict';
import { CostMeter } from '../src/costMeter.ts';
import { RoutingPolicy } from '../src/policy.ts';
import { F1, samplePolicy } from './helpers.ts';

function meter() {
  const rp = new RoutingPolicy();
  rp.load(samplePolicy());
  return new CostMeter(() => rp.current());
}

test('meter rounds each bucket up to the next minor unit', () => {
  const m = meter();
  // F1 price: input 30/ktok, output 60/ktok.
  // input 1500 -> ceil(1500*30/1000)=ceil(45)=45; output 500 -> ceil(500*60/1000)=ceil(30)=30
  const r = m.meter(F1, { input_tokens: 1500, output_tokens: 500 }, { workspace_id: 'w', call_id: 'c', role: 'plan', ts: 't' });
  assert.equal(r?.cost_minor, 75);
  assert.equal(r?.currency, 'USD');
});

test('a partial thousand rounds up, never truncates', () => {
  const m = meter();
  // input 1 token -> ceil(1*30/1000)=ceil(0.03)=1; output 0 -> 0
  const r = m.meter(F1, { input_tokens: 1, output_tokens: 0 }, { workspace_id: 'w', call_id: 'c', role: 'plan', ts: 't' });
  assert.equal(r?.cost_minor, 1);
});

test('estimate is deterministic and prices prompt plus max output', () => {
  const m = meter();
  const a = m.estimate(F1, 1000, 1000);
  const b = m.estimate(F1, 1000, 1000);
  // input 1000 -> 30; output 1000 -> 60
  assert.equal(a?.cost_minor, 90);
  assert.deepEqual(a, b);
});

test('the record carries the caller context and integer cost', () => {
  const m = meter();
  const r = m.meter(F1, { input_tokens: 2000, output_tokens: 1000 }, { workspace_id: 'ws', call_id: 'id', role: 'verify', ts: 'ts' });
  assert.equal(r?.workspace_id, 'ws');
  assert.equal(r?.role, 'verify');
  assert.equal(Number.isInteger(r?.cost_minor), true);
  assert.equal(r?.cost_minor, 60 + 60); // input 2000->60, output 1000->60
});
