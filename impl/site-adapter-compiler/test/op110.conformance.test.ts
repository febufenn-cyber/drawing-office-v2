// Op 110 — latency, throughput, and engine-confinement conformance. Replay
// overhead per tool, one synthesis learning pass, and one full health run each
// measured at or below budget on the stub corpus; no symbol in the subsystem
// imports engine or Electron code.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { invoke } from '../src/contract.ts';
import { health } from '../src/health.ts';
import { explore } from '../src/recorder.ts';
import { synthesize } from '../src/synthesizer.ts';
import { AdapterStore } from '../src/store.ts';
import { compiledShop, FakePage, FakeSurface, FIXED_CLOCK, HANDLE, ORIGIN, searchModel, SEARCH_SCRIPT, shopNodes } from './helpers.ts';

// Generous budgets: these guard against pathological regressions, not native
// engine latency (the stubs are in-memory). Replay and health call no model.
const REPLAY_BUDGET_MS = 5;
const SYNTH_BUDGET_MS = 10;
const HEALTH_BUDGET_MS = 10;

test('replay overhead per tool is within budget (amortized over 1000 calls)', () => {
  const { store, surface, graph } = compiledShop();
  const N = 1000;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) invoke(store, ORIGIN, 'search_products', { query: 'q' }, surface, graph, HANDLE);
  const per = (performance.now() - t0) / N;
  assert.ok(per <= REPLAY_BUDGET_MS, 'replay ' + per.toFixed(4) + 'ms/call');
});

test('one synthesis learning pass is within budget', () => {
  const traj = explore(new FakeSurface(), new FakePage(shopNodes()), FIXED_CLOCK, ORIGIN, HANDLE, SEARCH_SCRIPT);
  const t0 = performance.now();
  synthesize(traj, searchModel(), new AdapterStore(), FIXED_CLOCK);
  assert.ok(performance.now() - t0 <= SYNTH_BUDGET_MS);
});

test('one full health run is within budget', () => {
  const { store, surface, graph } = compiledShop();
  const t0 = performance.now();
  health(store.current(ORIGIN)!, surface, graph, HANDLE, FIXED_CLOCK);
  assert.ok(performance.now() - t0 <= HEALTH_BUDGET_MS);
});

test('no source imports an engine or Electron module; every import is local or node:', () => {
  const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
  const importFrom = /(?:import|export)\b[^'"]*\bfrom\s*['"]([^'"]+)['"]/g;
  const engine = /^(electron|puppeteer|playwright|chrome-remote-interface|cdp)(\/|$)/i;

  for (const f of readdirSync(src).filter((x) => x.endsWith('.ts'))) {
    const text = readFileSync(join(src, f), 'utf8');
    let m: RegExpExecArray | null;
    while ((m = importFrom.exec(text)) !== null) {
      const spec = m[1]!;
      assert.equal(engine.test(spec), false, f + ' imports engine module ' + spec);
      assert.equal(spec.startsWith('.') || spec.startsWith('node:'), true, f + ' imports non-local ' + spec);
    }
  }
});
