// Op 80 — determinism and model-isolation battery. Replaying a tool with identical
// params and page state yields a byte-identical action sequence and record across
// repeated runs; the replay and health paths make zero model calls; synthesis is
// byte-identical for a fixed trajectory and model response.

import test from 'node:test';
import assert from 'node:assert/strict';
import { invoke, replay } from '../src/contract.ts';
import { health } from '../src/health.ts';
import { explore } from '../src/recorder.ts';
import { synthesize } from '../src/synthesizer.ts';
import { AdapterStore } from '../src/store.ts';
import { canonical } from '../src/canonical.ts';
import { compiledShop, FakePage, FakeSurface, FIXED_CLOCK, HANDLE, ORIGIN, searchModel, SEARCH_SCRIPT, shopNodes } from './helpers.ts';

test('replay is byte-identical across ten repeated runs', () => {
  const { store } = compiledShop();
  const adapter = store.current(ORIGIN)!;
  const tool = adapter.tools[0]!;
  const first = (() => {
    const s = new FakeSurface();
    const r = replay(adapter, tool, { query: 'z' }, s, new FakePage(shopNodes()), HANDLE);
    return canonical({ r, acts: s.acts });
  })();
  for (let i = 0; i < 10; i++) {
    const s = new FakeSurface();
    const r = replay(adapter, tool, { query: 'z' }, s, new FakePage(shopNodes()), HANDLE);
    assert.equal(canonical({ r, acts: s.acts }), first);
  }
});

test('the replay path makes zero model calls', () => {
  const { store, graph, model } = compiledShop();
  const before = model.calls;
  invoke(store, ORIGIN, 'search_products', { query: 'q' }, new FakeSurface(), graph, HANDLE);
  assert.equal(model.calls, before);
});

test('the health path makes zero model calls', () => {
  const { store, surface, graph, model } = compiledShop();
  const before = model.calls;
  health(store.current(ORIGIN)!, surface, graph, HANDLE, FIXED_CLOCK);
  assert.equal(model.calls, before);
});

test('synthesis calls the model exactly once and is byte-identical for a fixed trajectory', () => {
  const traj = explore(new FakeSurface(), new FakePage(shopNodes()), FIXED_CLOCK, ORIGIN, HANDLE, SEARCH_SCRIPT);
  const m1 = searchModel();
  const m2 = searchModel();
  const a = synthesize(traj, m1, new AdapterStore(), FIXED_CLOCK).adapter;
  const b = synthesize(traj, m2, new AdapterStore(), FIXED_CLOCK).adapter;
  assert.equal(m1.calls, 1);
  assert.equal(m2.calls, 1);
  assert.equal(a.replay_digest, b.replay_digest);
  assert.equal(canonical({ ...a, version: 0 }), canonical({ ...b, version: 0 }));
});

test('the compiled adapter round-trips through the store byte-identical', () => {
  const { store, version } = compiledShop();
  assert.equal(canonical(store.get(ORIGIN, version)), canonical(store.current(ORIGIN)));
});
