// Op 20 — P1 site-adapter-contract and the replay interpreter. invoke loads the
// current version, validates params and result, and attaches provenance; replay
// resolves anchors by digest and crosses the stub surface; identical inputs yield
// a byte-identical action sequence; an unresolved anchor returns anchor_unresolved
// with no selector fallback; tools returns the stored signatures.

import test from 'node:test';
import assert from 'node:assert/strict';
import { invoke, replay, tools } from '../src/contract.ts';
import { canonical } from '../src/canonical.ts';
import { AdapterStore } from '../src/store.ts';
import { compiledShop, FakePage, FakeSurface, HANDLE, ORIGIN, shopNodes } from './helpers.ts';

test('invoke loads the current adapter, replays, and attaches provenance', () => {
  const { store, surface, graph } = compiledShop();
  surface.acts.length = 0;
  const res = invoke(store, ORIGIN, 'search_products', { query: 'phone' }, surface, graph, HANDLE);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.deepEqual(res.result.value, [{ title: 'Widget', price: '9.99' }]);
  assert.equal(res.result.provenance.length, 3);
  assert.equal(res.result.actions[0]?.value, 'phone'); // param bound into the type action
});

test('invoke rejects params off schema and a missing tool', () => {
  const { store, surface, graph } = compiledShop();
  const bad = invoke(store, ORIGIN, 'search_products', {} as Record<string, string>, surface, graph, HANDLE);
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.error, 'bad_params');
  const missing = invoke(store, ORIGIN, 'nope', { query: 'x' }, surface, graph, HANDLE);
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error, 'no_such_tool');
});

test('invoke on an origin with no adapter returns no_adapter', () => {
  const { surface, graph } = compiledShop();
  const res = invoke(new AdapterStore(), 'https://x.example', 't', { a: 'b' }, surface, graph, HANDLE);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error, 'no_adapter');
});

test('replay is deterministic: identical inputs yield a byte-identical action sequence and value', () => {
  const { store } = compiledShop();
  const adapter = store.current(ORIGIN);
  assert.ok(adapter);
  const tool = adapter!.tools[0]!;
  const s1 = new FakeSurface();
  const s2 = new FakeSurface();
  const r1 = replay(adapter!, tool, { query: 'k' }, s1, new FakePage(shopNodes()), HANDLE);
  const r2 = replay(adapter!, tool, { query: 'k' }, s2, new FakePage(shopNodes()), HANDLE);
  assert.equal(canonical(r1), canonical(r2));
  assert.equal(canonical(s1.acts), canonical(s2.acts));
});

test('an unresolved anchor returns anchor_unresolved with the step index and no further action', () => {
  const { store } = compiledShop();
  const adapter = store.current(ORIGIN)!;
  const tool = adapter.tools[0]!;
  const graph = new FakePage(shopNodes());
  graph.remove('n-submit'); // step seq 1
  const surface = new FakeSurface();
  const res = replay(adapter, tool, { query: 'k' }, surface, graph, HANDLE);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'anchor_unresolved:1');
  assert.equal(surface.acts.length, 1); // only the step-0 type ran; no fallback
});

test('tools returns the stored typed signatures exactly', () => {
  const { store } = compiledShop();
  const sigs = tools(store, ORIGIN);
  assert.equal(sigs.length, 1);
  assert.equal(sigs[0]?.name, 'search_products');
  assert.equal(sigs[0]?.kind, 'search');
  assert.deepEqual(sigs[0]?.params_schema, { kind: 'record', fields: { query: 'string' } });
  assert.deepEqual(sigs[0]?.return_schema, { kind: 'list', fields: { title: 'string', price: 'string' } });
});
