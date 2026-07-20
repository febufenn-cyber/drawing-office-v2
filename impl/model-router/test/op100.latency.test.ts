// Op 100 — latency and timeout enforcement.
// Dispatch overhead (excluding provider wait, which the stub does not incur) is
// measured against the p99 <= 15 ms budget; the adapter timeout is enforced.

import test from 'node:test';
import assert from 'node:assert/strict';
import type { Role } from '../src/types.ts';
import { makeRouter } from './helpers.ts';

test('dispatch overhead stays within budget', () => {
  const w = makeRouter();
  const samples: number[] = [];
  for (let i = 0; i < 2000; i++) {
    const t0 = performance.now();
    const r = w.dispatcher.route({ workspace_id: 'w1', role: 'plan' as Role, prompt_bundle: 'p', prompt_tokens: 100, max_output: 100 });
    samples.push(performance.now() - t0);
    assert.equal(r.status, 'routed');
  }
  samples.sort((a, b) => a - b);
  const p99 = samples[Math.floor(samples.length * 0.99)] ?? 0;
  console.log('  [op100] dispatch overhead p99 = ' + p99.toFixed(3) + ' ms (budget 15 ms)');
  assert.ok(p99 < 15, 'dispatch p99 ' + p99.toFixed(3) + 'ms exceeded the 15 ms budget');
});

test('the adapter timeout is enforced: a slow provider returns provider_error', () => {
  const w = makeRouter({ openaiDuration: 60000 }); // plan routes to the openai frontier
  const r = w.dispatcher.route({ workspace_id: 'w1', role: 'plan' as Role, prompt_bundle: 'p', prompt_tokens: 100, max_output: 100 });
  assert.equal(r.status, 'provider_error');
});
