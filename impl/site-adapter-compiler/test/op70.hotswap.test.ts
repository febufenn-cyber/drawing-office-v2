// Op 70 — P7 hot-swapper. A drift signal drives re-explore then re-synthesize to a
// candidate version; the candidate is promoted by atomic swap only after it passes
// health; a candidate failing health keeps the prior version and marks it
// degraded; two concurrent drift signals for one origin serialize under the lock.

import test from 'node:test';
import assert from 'node:assert/strict';
import { HotSwapper } from '../src/hotswap.ts';
import type { SwapOutcome } from '../src/hotswap.ts';
import type { ExploreCommand, ExploreDriver } from '../src/seams.ts';
import { compiledShop, FIXED_CLOCK, HANDLE, ORIGIN, SEARCH_SCRIPT } from './helpers.ts';

class FixedDriver implements ExploreDriver {
  script(): readonly ExploreCommand[] {
    return SEARCH_SCRIPT;
  }
}

test('a healthy candidate is promoted by atomic swap', () => {
  const { store, surface, graph, model } = compiledShop();
  const swapper = new HotSwapper(store, new FixedDriver(), surface, graph, model, FIXED_CLOCK);
  const outcome = swapper.relearn_and_swap(ORIGIN, HANDLE);
  assert.equal(outcome, 'promoted');
  assert.equal(store.currentVersion(ORIGIN), 2); // candidate promoted
});

test('a candidate failing health keeps the prior version live and marks it degraded', () => {
  const { store, surface, graph, model } = compiledShop();
  graph.dropField('n-result', 'price'); // candidate will validate short on health
  const swapper = new HotSwapper(store, new FixedDriver(), surface, graph, model, FIXED_CLOCK);
  const outcome = swapper.relearn_and_swap(ORIGIN, HANDLE);
  assert.equal(outcome, 'degraded_kept_prior');
  assert.equal(store.currentVersion(ORIGIN), 1); // prior stays live, never regressed
  assert.equal(store.isDegraded(ORIGIN, 1), true);
});

test('the candidate is written before verification but never promoted unverified', () => {
  const { store, surface, graph, model } = compiledShop();
  graph.dropField('n-result', 'price');
  const swapper = new HotSwapper(store, new FixedDriver(), surface, graph, model, FIXED_CLOCK);
  swapper.relearn_and_swap(ORIGIN, HANDLE);
  assert.ok(store.get(ORIGIN, 2)); // candidate retained for provenance
  assert.equal(store.currentVersion(ORIGIN), 1); // but not current
});

test('two concurrent drift signals for one origin serialize under the lock', () => {
  const { store, surface, graph, model } = compiledShop();
  let observed: SwapOutcome | null = null;
  const reentrant: ExploreDriver = {
    script(origin: string): readonly ExploreCommand[] {
      // Re-enter while the lock is held; the second signal must see 'busy'.
      observed = swapper.relearn_and_swap(origin, HANDLE);
      return SEARCH_SCRIPT;
    },
  };
  const swapper = new HotSwapper(store, reentrant, surface, graph, model, FIXED_CLOCK);
  const outer = swapper.relearn_and_swap(ORIGIN, HANDLE);
  assert.equal(observed, 'busy');
  assert.equal(outer, 'promoted');
  assert.equal(swapper.isLocked(ORIGIN), false); // lock released after
});
