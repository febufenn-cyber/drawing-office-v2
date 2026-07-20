// Op 60 — P6 drift-detector and the debounce counter. Each tool is classified
// healthy, drifted, or broken against the baseline; adapter status equals the
// worst tool status; drift and the re-learn signal fire only on the third
// consecutive failing run; a single transient failure never signals re-learn.

import test from 'node:test';
import assert from 'node:assert/strict';
import { DriftDetector, worstStatus } from '../src/drift.ts';
import type { HealthReport, ToolStatus } from '../src/types.ts';

const ORIGIN = 'https://a.example';

function report(...statuses: Array<[string, ToolStatus]>): HealthReport {
  return {
    adapter_id: 'a', version: 1, ts: '2026-07-20T00:00:00Z',
    tools: statuses.map(([name, status]) => ({ name, status, detail: status })),
  };
}

test('worst status ranks broken over drifted over healthy', () => {
  assert.equal(worstStatus(['healthy', 'drifted', 'healthy']), 'drifted');
  assert.equal(worstStatus(['drifted', 'broken', 'healthy']), 'broken');
  assert.equal(worstStatus(['healthy', 'healthy']), 'healthy');
});

test('adapter status equals the worst tool status', () => {
  const d = new DriftDetector();
  const v = d.observe(report(['x', 'healthy'], ['y', 'drifted']), ORIGIN);
  assert.equal(v.adapter_status, 'drifted');
});

test('a single transient failure never signals re-learn', () => {
  const d = new DriftDetector();
  const v = d.observe(report(['x', 'broken']), ORIGIN);
  assert.equal(v.signal_relearn, false);
  assert.equal(d.failures(ORIGIN, 'x'), 1);
});

test('drift and the re-learn signal fire only on the third consecutive failing run', () => {
  const d = new DriftDetector();
  assert.equal(d.observe(report(['x', 'drifted']), ORIGIN).signal_relearn, false); // 1
  assert.equal(d.observe(report(['x', 'drifted']), ORIGIN).signal_relearn, false); // 2
  assert.equal(d.observe(report(['x', 'drifted']), ORIGIN).signal_relearn, true); // 3
});

test('a healthy run resets the failure count and defers the signal', () => {
  const d = new DriftDetector();
  d.observe(report(['x', 'broken']), ORIGIN);
  d.observe(report(['x', 'broken']), ORIGIN); // 2 consecutive
  d.observe(report(['x', 'healthy']), ORIGIN); // reset
  assert.equal(d.failures(ORIGIN, 'x'), 0);
  assert.equal(d.observe(report(['x', 'broken']), ORIGIN).signal_relearn, false); // back to 1
  assert.equal(d.observe(report(['x', 'broken']), ORIGIN).signal_relearn, false); // 2
  assert.equal(d.observe(report(['x', 'broken']), ORIGIN).signal_relearn, true); // 3
});

test('debounce is per tool and per origin', () => {
  const d = new DriftDetector();
  d.observe(report(['x', 'broken'], ['y', 'healthy']), ORIGIN);
  d.observe(report(['x', 'broken'], ['y', 'broken']), ORIGIN);
  assert.equal(d.failures(ORIGIN, 'x'), 2);
  assert.equal(d.failures(ORIGIN, 'y'), 1);
  assert.equal(d.failures('https://b.example', 'x'), 0);
});
