// Op 100 — latency and throughput. p99 at or below budget: reserve 5 ms, fan-out
// dispatch overhead 50 ms per sub-agent, wake-to-dispatch 100 ms (excluding executor
// time — the stub executor is instant).

import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { BudgetManager } from '../src/budget.ts';
import { ceiling, researchTask, scheduledTrigger, StubLedger, wire, WS } from './helpers.ts';

const RESERVE_BUDGET_MS = 5;
const DISPATCH_BUDGET_MS = 50;
const WAKE_BUDGET_MS = 100;

function p99(samples: number[]): number {
  const s = [...samples].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.99))] ?? 0;
}

test('reserve is within budget', () => {
  const b = new BudgetManager(new StubLedger(0, 10_000_000));
  const c = ceiling({ tokens: 1_000_000, seconds: 1_000_000, money_minor: 1_000_000 });
  const req = { tokens: 1, seconds: 1, money_max: 1 };
  for (let i = 0; i < 50; i++) { const r = b.reserve('t', WS, c, req); if (r.granted) b.release(r.reservation); }
  const samples: number[] = [];
  for (let i = 0; i < 2000; i++) {
    const t0 = performance.now();
    const r = b.reserve('t', WS, c, req);
    samples.push(performance.now() - t0);
    if (r.granted) b.release(r.reservation);
  }
  assert.ok(p99(samples) <= RESERVE_BUDGET_MS, 'reserve p99 ' + p99(samples).toFixed(3) + 'ms');
});

test('fan-out dispatch overhead per sub-agent is within budget', () => {
  const w = wire();
  const task = researchTask(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10'], { producing_roles: ['agent-0'] });
  const width = 5;
  for (let i = 0; i < 30; i++) w.fanout.run(task, width);
  const samples: number[] = [];
  for (let i = 0; i < 500; i++) {
    const t0 = performance.now();
    w.fanout.run(task, width);
    samples.push((performance.now() - t0) / width); // per sub-agent
  }
  assert.ok(p99(samples) <= DISPATCH_BUDGET_MS, 'dispatch/sub-agent p99 ' + p99(samples).toFixed(3) + 'ms');
});

test('wake-to-dispatch is within budget', () => {
  const samples: number[] = [];
  for (let i = 0; i < 500; i++) {
    const w = wire(); // fresh state per firing
    const t = scheduledTrigger({ trigger_id: 'trig-' + String(i) });
    const t0 = performance.now();
    w.runner.run(t);
    samples.push(performance.now() - t0);
  }
  assert.ok(p99(samples) <= WAKE_BUDGET_MS, 'wake-to-dispatch p99 ' + p99(samples).toFixed(3) + 'ms');
});
