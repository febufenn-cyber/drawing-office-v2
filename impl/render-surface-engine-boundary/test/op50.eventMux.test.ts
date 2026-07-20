// Op 50 — P7 event-multiplexer.
// A committed navigation increments nav_epoch, writes it to P2, and emits a nav
// event carrying it; the event epoch equals the next snapshot epoch; events are
// ordered by occurrence; a nav event is never dropped under buffer pressure.

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventMultiplexer } from '../src/eventMux.ts';
import { NOT_FOUND, PageHandleRegistry } from '../src/registry.ts';
import { RenderSurface } from '../src/renderSurface.ts';
import { StubEngine } from '../src/stubEngine.ts';
import { KEY, mkNode, now, secretResolver } from './helpers.ts';

test('a committed navigation increments the epoch and emits a nav event carrying it', () => {
  const reg = new PageHandleRegistry();
  const h = reg.mint('W', 'persist:W', 's');
  const mux = new EventMultiplexer(reg);
  const ev = mux.onNavigationCommit(h);
  assert.notEqual(ev, NOT_FOUND);
  if (ev !== NOT_FOUND && ev.kind === 'nav') {
    assert.equal(ev.nav_epoch, 1);
  }
  assert.equal(reg.epoch(h), 1); // the next snapshot stamps this same epoch
});

test('events are delivered in occurrence order', () => {
  const reg = new PageHandleRegistry();
  const h = reg.mint('W', 'persist:W', 's');
  const mux = new EventMultiplexer(reg);
  mux.ingestNetwork(h.handle_id, 'GET /a');
  mux.ingestMutation(h.handle_id, 'dom+1');
  mux.onNavigationCommit(h);
  mux.ingestNetwork(h.handle_id, 'GET /b');
  const drained = mux.drain(h);
  assert.deepEqual(drained.map((e) => e.kind), ['network', 'mutation', 'nav', 'network']);
});

test('a nav event is never dropped under buffer pressure', () => {
  const reg = new PageHandleRegistry();
  const h = reg.mint('W', 'persist:W', 's');
  const mux = new EventMultiplexer(reg, 3); // tiny buffer
  mux.ingestNetwork(h.handle_id, 'n0');
  mux.onNavigationCommit(h); // the nav event must survive
  for (let i = 0; i < 20; i++) mux.ingestNetwork(h.handle_id, 'n' + String(i));
  const drained = mux.drain(h);
  assert.equal(drained.length, 3);
  assert.equal(drained.some((e) => e.kind === 'nav'), true);
});

test('observe through the contract reports the new epoch matching the next snapshot', () => {
  const engine = new StubEngine();
  const rs = new RenderSurface(engine, KEY, secretResolver, now);
  const opened = rs.open('https://site', { workspace_id: 'W', partition_key: 'W:main' });
  assert.equal(opened.ok, true);
  if (!opened.ok) return;
  const h = opened.value;
  const surface = engine.surfaceIds().at(-1) as string;
  engine.navigate(surface, 'https://site/2', [mkNode('x')]);
  const evs = rs.observe(h);
  assert.equal(evs.ok, true);
  const nav = evs.ok ? evs.value.find((e) => e.kind === 'nav') : undefined;
  assert.ok(nav);
  const snap = rs.snapshot(h);
  if (nav && nav.kind === 'nav' && snap.ok) assert.equal(nav.nav_epoch, snap.value.nav_epoch);
});
