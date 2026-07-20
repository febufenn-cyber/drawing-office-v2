// Op 70 — end-to-end fan-out research battery. An N-page research task partitions,
// dispatches, merges, and verifies into one artifact; a task that hits its ceiling
// halts at the ceiling with a partial artifact marking the gaps.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ceiling, researchTask, StubExecutor, wire } from './helpers.ts';

test('a six-page task fans out to three sub-agents and merges into one verified artifact', () => {
  const w = wire();
  const res = w.fanout.run(researchTask(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], { producing_roles: ['agent-0'] }), 3);
  assert.ok(res.ok);
  if (!res.ok) return;
  assert.equal(w.executor.submits.length, 3);
  assert.equal(res.report.artifact.claims.length, 6); // one per page, no page duplicated
  assert.equal(res.report.artifact.gaps.length, 0);
});

test('a task that exceeds its ceiling halts at the ceiling and marks every bucket a gap', () => {
  const w = wire();
  const task = researchTask(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], {
    ceiling: ceiling({ tokens: 50 }), // 6 pages * 10 tokens = 60 > 50
    producing_roles: ['agent-0'],
  });
  const res = w.fanout.run(task, 3);
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.reason, 'TOKEN_CEILING');
  assert.equal(w.executor.submits.length, 0); // nothing dispatched over the ceiling
  assert.deepEqual(res.report.artifact.gaps, ['agent-0', 'agent-1', 'agent-2']); // gaps marked
});

test('a partial fan-out (one exhausted sub-agent) still returns the other buckets merged', () => {
  const executor = new StubExecutor({ gapAgents: new Set(['agent-2']) });
  const w = wire({ executor });
  const res = w.fanout.run(researchTask(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], { producing_roles: ['agent-0'] }), 3);
  assert.ok(res.ok);
  if (!res.ok) return;
  assert.deepEqual(res.report.artifact.gaps, ['agent-2']); // the exhausted bucket is a gap
  assert.ok(res.report.artifact.claims.length >= 4); // the other two buckets' claims remain
});
