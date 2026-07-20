// Op 40 — P1 fanout-scheduler. Partition covers every page once with no overlap; N
// sub-agent DAGs are dispatched, each with a nonzero slice summing within the
// ceiling; an incomplete bucket yields a gap marker; merge and verify are invoked.

import test from 'node:test';
import assert from 'node:assert/strict';
import { partition } from '../src/fanout.ts';
import { researchTask, StubExecutor, wire } from './helpers.ts';

test('partition covers every page exactly once with no overlap', () => {
  const pages = ['p1', 'p2', 'p3', 'p4', 'p5'];
  const buckets = partition(pages, 2);
  const flat = buckets.flat().sort();
  assert.deepEqual(flat, [...pages].sort()); // every page once
  assert.equal(new Set(flat).size, pages.length); // no overlap
});

test('N is clamped to the page count when smaller', () => {
  assert.equal(partition(['p1'], 3).length, 1);
});

test('a width below 1 is rejected', () => {
  assert.throws(() => partition(['p1'], 0));
});

test('fan_out dispatches N sub-agent DAGs, each with a nonzero slice within the ceiling', () => {
  const w = wire();
  const res = w.fanout.run(researchTask(['p1', 'p2', 'p3', 'p4']), 2);
  assert.equal(res.ok, true);
  assert.equal(w.executor.submits.length, 2);
  for (const s of w.executor.submits) assert.ok(s.budget_hook.tokens > 0); // nonzero sub-slice
  // The two sub-slices sum to the whole page workload (4 pages * per-page tokens).
  const summed = w.executor.submits.reduce((n, s) => n + s.budget_hook.tokens, 0);
  assert.equal(summed, 4 * 10);
});

test('an incomplete bucket yields a gap marker, never a silent drop', () => {
  const executor = new StubExecutor({ gapAgents: new Set(['agent-1']) });
  const w = wire({ executor });
  const res = w.fanout.run(researchTask(['p1', 'p2', 'p3', 'p4']), 2);
  assert.ok(res.ok);
  if (res.ok) assert.deepEqual(res.report.artifact.gaps, ['agent-1']);
});

test('fan_out merges partials and runs verify into one report', () => {
  const w = wire();
  const res = w.fanout.run(researchTask(['p1', 'p2', 'p3']), 2);
  assert.ok(res.ok);
  if (!res.ok) return;
  assert.equal(res.report.artifact.claims.length, 3); // one claim per page, merged
  assert.equal(res.report.verify_role, 'verifier'); // independent verify ran
});
