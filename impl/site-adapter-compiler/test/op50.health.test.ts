// Op 50 — P5 health-checker. health replays every tool and classifies each; a
// tool passes only when anchors resolve, the return validates, and all golden
// assertions hold; the run mutates no adapter and calls no model; the scheduler
// fires health once per configured interval.

import test from 'node:test';
import assert from 'node:assert/strict';
import { allHealthy, health, HealthScheduler } from '../src/health.ts';
import { canonical } from '../src/canonical.ts';
import { compiledShop, FakeSurface, FIXED_CLOCK, HANDLE, ORIGIN } from './helpers.ts';

test('a fully-resolving adapter reports every tool healthy', () => {
  const { store, surface, graph } = compiledShop();
  const report = health(store.current(ORIGIN)!, surface, graph, HANDLE, FIXED_CLOCK);
  assert.equal(report.tools.length, 1);
  assert.equal(report.tools[0]!.status, 'healthy');
  assert.equal(allHealthy(report), true);
});

test('a removed anchor makes the tool broken', () => {
  const { store, surface, graph } = compiledShop();
  graph.remove('n-result');
  const report = health(store.current(ORIGIN)!, surface, graph, HANDLE, FIXED_CLOCK);
  assert.equal(report.tools[0]!.status, 'broken');
  assert.equal(allHealthy(report), false);
});

test('a missing return field makes the tool drifted', () => {
  const { store, surface, graph } = compiledShop();
  graph.dropField('n-result', 'price');
  const report = health(store.current(ORIGIN)!, surface, graph, HANDLE, FIXED_CLOCK);
  assert.equal(report.tools[0]!.status, 'drifted');
});

test('the health run mutates no adapter and calls no model', () => {
  const { store, surface, graph, model } = compiledShop();
  const before = canonical(store.current(ORIGIN));
  const callsBefore = model.calls;
  health(store.current(ORIGIN)!, surface, graph, HANDLE, FIXED_CLOCK);
  assert.equal(canonical(store.current(ORIGIN)), before);
  assert.equal(model.calls, callsBefore); // no learning pass on the health path
});

test('health replays through the surface; it does not touch the stored surface log', () => {
  const { store, graph } = compiledShop();
  const probe = new FakeSurface();
  health(store.current(ORIGIN)!, probe, graph, HANDLE, FIXED_CLOCK);
  assert.deepEqual(probe.acts.map((a) => a.action), ['type', 'click']); // read did not act
});

test('the scheduler fires once per configured interval', () => {
  const sched = new HealthScheduler(10);
  assert.equal(sched.due(ORIGIN, 0), true); // first tick fires
  assert.equal(sched.due(ORIGIN, 3), false);
  assert.equal(sched.due(ORIGIN, 9), false);
  assert.equal(sched.due(ORIGIN, 10), true); // one interval elapsed
  assert.equal(sched.due(ORIGIN, 15), false);
  assert.equal(sched.due(ORIGIN, 20), true);
});

test('the scheduler is per-origin', () => {
  const sched = new HealthScheduler(10);
  assert.equal(sched.due('a', 0), true);
  assert.equal(sched.due('b', 0), true); // independent origin fires on its own first tick
});
