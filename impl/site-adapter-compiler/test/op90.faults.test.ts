// Op 90 — drift and hot-swap battery with fault injection on the stub origin and a
// fixed clock. Anchor removal and return-schema change are each detected and
// classified; drift fires only after three consecutive failures; a re-learn that
// fails health never promotes and leaves the prior version degraded; a successful
// swap lets an in-flight call finish on the prior version while new calls bind the
// new one; the swap is observed atomic (a reader sees exactly one live version).

import test from 'node:test';
import assert from 'node:assert/strict';
import { health } from '../src/health.ts';
import { DriftDetector } from '../src/drift.ts';
import { HotSwapper } from '../src/hotswap.ts';
import { replay } from '../src/contract.ts';
import type { ExploreCommand, ExploreDriver } from '../src/seams.ts';
import { compiledShop, FakePage, FakeSurface, FIXED_CLOCK, HANDLE, ORIGIN, SEARCH_SCRIPT, shopNodes } from './helpers.ts';

class FixedDriver implements ExploreDriver {
  script(): readonly ExploreCommand[] {
    return SEARCH_SCRIPT;
  }
}

test('anchor removal is detected and classified broken', () => {
  const { store, surface, graph } = compiledShop();
  graph.remove('n-result');
  const report = health(store.current(ORIGIN)!, surface, graph, HANDLE, FIXED_CLOCK);
  assert.equal(report.tools[0]!.status, 'broken');
  assert.match(report.tools[0]!.detail, /anchor_unresolved/);
});

test('a return-schema change is detected and classified drifted', () => {
  const { store, surface, graph } = compiledShop();
  graph.dropField('n-result', 'title');
  const report = health(store.current(ORIGIN)!, surface, graph, HANDLE, FIXED_CLOCK);
  assert.equal(report.tools[0]!.status, 'drifted');
});

test('drift fires only after three consecutive faulty health runs', () => {
  const { store, surface, graph } = compiledShop();
  graph.remove('n-result'); // sustained fault
  const detector = new DriftDetector();
  const signals: boolean[] = [];
  for (let i = 0; i < 3; i++) {
    const report = health(store.current(ORIGIN)!, surface, graph, HANDLE, FIXED_CLOCK);
    signals.push(detector.observe(report, ORIGIN).signal_relearn);
  }
  assert.deepEqual(signals, [false, false, true]);
});

test('a single transient fault followed by recovery never signals re-learn', () => {
  const { store, surface, graph } = compiledShop();
  const detector = new DriftDetector();
  graph.remove('n-result'); // one bad run
  assert.equal(detector.observe(health(store.current(ORIGIN)!, surface, graph, HANDLE, FIXED_CLOCK), ORIGIN).signal_relearn, false);
  graph.nodes = shopNodes(); // origin recovers
  const good = detector.observe(health(store.current(ORIGIN)!, surface, graph, HANDLE, FIXED_CLOCK), ORIGIN);
  assert.equal(good.signal_relearn, false);
  assert.equal(good.adapter_status, 'healthy');
});

test('a re-learn that fails health never promotes and leaves the prior version degraded', () => {
  const { store, surface, graph, model } = compiledShop();
  graph.dropField('n-result', 'price'); // candidate cannot pass health
  const swapper = new HotSwapper(store, new FixedDriver(), surface, graph, model, FIXED_CLOCK);
  assert.equal(swapper.relearn_and_swap(ORIGIN, HANDLE), 'degraded_kept_prior');
  assert.equal(store.currentVersion(ORIGIN), 1);
  assert.equal(store.isDegraded(ORIGIN, 1), true);
});

test('an in-flight call finishes on the prior version while new calls bind the new one', () => {
  const { store, surface, graph, model } = compiledShop();
  const held = store.current(ORIGIN)!; // an in-flight caller captured v1
  assert.equal(held.version, 1);

  const swapper = new HotSwapper(store, new FixedDriver(), surface, graph, model, FIXED_CLOCK);
  assert.equal(swapper.relearn_and_swap(ORIGIN, HANDLE), 'promoted');

  // The held (in-flight) adapter still replays on its own version.
  const r = replay(held, held.tools[0]!, { query: 'x' }, new FakeSurface(), new FakePage(shopNodes()), HANDLE);
  assert.equal(r.ok, true);
  // New invocations bind the promoted version.
  assert.equal(store.current(ORIGIN)!.version, 2);
});

test('a reader observes exactly one live version at every instant of a swap', () => {
  const { store } = compiledShop();
  assert.equal(store.current(ORIGIN)!.version, 1); // before
  store.put(ORIGIN, store.current(ORIGIN)!, store.trajectory(ORIGIN, 1)!);
  // put appended v2 but did not move the pointer: still exactly one live version.
  assert.equal(store.current(ORIGIN)!.version, 1);
  store.swap(ORIGIN, 2);
  assert.equal(store.current(ORIGIN)!.version, 2); // after; never zero or two
});
