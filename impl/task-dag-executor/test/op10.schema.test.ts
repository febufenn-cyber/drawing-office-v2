// Op 10 — P1 task-dag-schema. Golden graphs validate; cyclic, duplicate-id, and
// mistyped-port graphs are rejected with the offending element named; input
// digests are identical across port orderings.

import test from 'node:test';
import assert from 'node:assert/strict';
import { inputDigest, validate } from '../src/schema.ts';
import type { Step, TaskGraph } from '../src/types.ts';
import { linearGraph } from './helpers.ts';

test('a well-formed DAG validates', () => {
  const res = validate(linearGraph());
  assert.equal(res.ok, true);
});

test('a duplicate step id is rejected and named', () => {
  const g = linearGraph();
  const dup: TaskGraph = { ...g, steps: [...g.steps, g.steps[0]!] };
  const res = validate(dup);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.reason, 'DUPLICATE_ID');
    assert.equal(res.at, 's1');
  }
});

test('an edge to a missing step or port is rejected', () => {
  const g = linearGraph();
  const bad: TaskGraph = { ...g, edges: [...g.edges, { from_step: 's1', from_port: 'page', to_step: 'zzz', to_port: 'x' }] };
  const res = validate(bad);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, 'BAD_EDGE');
});

test('a port-type mismatch across an edge is rejected', () => {
  const g = linearGraph();
  // s4.done is boolean; wiring it into s5 via a string-typed target port mismatches.
  const steps = g.steps.map((s): Step => s.step_id === 's5'
    ? { ...s, inputs: [{ name: 'done', type: 'string' }] }
    : s);
  const res = validate({ ...g, steps });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, 'BAD_EDGE');
});

test('a cycle is rejected with the cycle path named', () => {
  const g = linearGraph();
  // s3.verdict -> s2.page (types match, ports exist) closes the loop s2 -> s3 -> s2.
  const cyclic: TaskGraph = { ...g, edges: [...g.edges, { from_step: 's3', from_port: 'verdict', to_step: 's2', to_port: 'page' }] };
  const res = validate(cyclic);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.reason, 'CYCLE');
    assert.ok(res.at.includes('s2'));
  }
});

test('input_digest is byte-identical regardless of port order', () => {
  const s = linearGraph().steps[2]!; // compare step
  const a = inputDigest(s, { title: 'X', extra: 'Y' });
  const b = inputDigest(s, { extra: 'Y', title: 'X' });
  assert.equal(a, b);
});

test('input_digest changes when a resolved input changes', () => {
  const s = linearGraph().steps[2]!;
  assert.notEqual(inputDigest(s, { title: 'X' }), inputDigest(s, { title: 'Z' }));
});
